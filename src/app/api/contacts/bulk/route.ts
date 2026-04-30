/**
 * POST /api/contacts/bulk
 *
 * multipart/form-data:
 *   - contacts: JSON文字列 [{ id, name, nameKana, company, department, ... }, ...]
 *   - frontImage_{contactId}: 名刺の表面画像（任意）
 *   - backImage_{contactId}: 名刺の裏面画像（任意）
 *
 * 動作:
 *   1. 画像があれば Drive にアップロードして URL 取得
 *   2. メール / 電話 / 氏名+会社 で既存コンタクトと重複検知
 *   3a. 既存と一致 → 旧名刺を ContactCardHistory に退避し、本体を最新で上書き
 *   3b. 新規 → 新しい Contact を作成
 *   4. 同じ会社の既存 Group があれば groupSuggestions に追加
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { uploadCardImage } from '@/lib/drive-card-images'

interface ContactInput {
  id?: string
  name: string
  nameKana?: string
  connectionType?: string
  company?: string
  department?: string
  title?: string
  email?: string
  phone?: string
  lineId?: string
  gmailAlias?: string
  website?: string
  address?: string
  episodeMemo?: string
}

function normalize(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-‐－ー‒–—‑]/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .trim()
}

function normalizePhone(p: string | null | undefined): string {
  return (p || '').replace(/\D/g, '')
}

async function findDuplicate(input: ContactInput) {
  const email = input.email?.trim().toLowerCase()
  if (email) {
    const byEmail = await prisma.contact.findFirst({ where: { email } })
    if (byEmail) return byEmail
  }
  const phoneNorm = normalizePhone(input.phone)
  if (phoneNorm.length >= 9) {
    const all = await prisma.contact.findMany({
      where: { phone: { not: null } },
      select: { id: true, name: true, company: true, department: true, title: true, email: true, phone: true, website: true, address: true, nameKana: true, cardImageUrl: true, cardImageBackUrl: true },
    })
    const hit = all.find(c => normalizePhone(c.phone) === phoneNorm)
    if (hit) return hit
  }
  const nameKey = normalize(input.name)
  const companyKey = normalize(input.company)
  if (nameKey && companyKey) {
    const candidates = await prisma.contact.findMany({
      where: { company: { not: null } },
      select: { id: true, name: true, company: true, department: true, title: true, email: true, phone: true, website: true, address: true, nameKana: true, cardImageUrl: true, cardImageBackUrl: true },
    })
    const hit = candidates.find(c => normalize(c.name) === nameKey && normalize(c.company) === companyKey)
    if (hit) return hit
  }
  return null
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken as string | undefined

  const formData = await request.formData()
  const contactsRaw = formData.get('contacts')
  if (typeof contactsRaw !== 'string') {
    return NextResponse.json({ error: 'contacts が必要です' }, { status: 400 })
  }
  let contacts: ContactInput[]
  try {
    contacts = JSON.parse(contactsRaw)
  } catch {
    return NextResponse.json({ error: 'contacts がJSONとしてパースできません' }, { status: 400 })
  }
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'contacts が空です' }, { status: 400 })
  }

  const created: { id: string; name: string; mode: 'created' | 'updated' }[] = []
  const groupSuggestions: { contactId: string; groupId: string; groupName: string; type: string }[] = []

  for (const data of contacts) {
    if (!data.name || data.name.trim() === '') continue
    const inputId = data.id || crypto.randomUUID()

    // 重複チェック
    const dup = await findDuplicate(data)
    const targetContactId = dup?.id || inputId

    // 画像アップロード（accessToken がある場合のみ）
    const frontFile = formData.get(`frontImage_${data.id}`) as File | null
    const backFile = formData.get(`backImage_${data.id}`) as File | null

    let frontUrl: string | null = null
    let backUrl: string | null = null

    if (accessToken) {
      if (frontFile && frontFile.size > 0) {
        const buf = Buffer.from(await frontFile.arrayBuffer())
        frontUrl = await uploadCardImage({
          accessToken,
          contactId: targetContactId,
          side: 'front',
          data: buf,
          mimeType: frontFile.type,
        })
      }
      if (backFile && backFile.size > 0) {
        const buf = Buffer.from(await backFile.arrayBuffer())
        backUrl = await uploadCardImage({
          accessToken,
          contactId: targetContactId,
          side: 'back',
          data: buf,
          mimeType: backFile.type,
        })
      }
    }

    if (dup) {
      // 既存コンタクト → 旧名刺をhistoryへ退避してから本体を更新
      await prisma.contactCardHistory.create({
        data: {
          id: crypto.randomUUID(),
          contactId: dup.id,
          name: dup.name,
          nameKana: dup.nameKana,
          company: dup.company,
          department: dup.department,
          title: dup.title,
          email: dup.email,
          phone: dup.phone,
          website: dup.website,
          address: dup.address,
          cardImageUrl: dup.cardImageUrl,
          cardImageBackUrl: dup.cardImageBackUrl,
          reason: 'replaced_by_newer',
        },
      })

      const updated = await prisma.contact.update({
        where: { id: dup.id },
        data: {
          updatedAt: new Date(),
          name: data.name,
          nameKana: data.nameKana || dup.nameKana,
          company: data.company || dup.company,
          department: data.department || null,
          title: data.title || null,
          email: data.email || dup.email,
          phone: data.phone || dup.phone,
          website: data.website || dup.website,
          address: data.address || dup.address,
          cardImageUrl: frontUrl || dup.cardImageUrl,
          cardImageBackUrl: backUrl || dup.cardImageBackUrl,
        },
      })
      created.push({ id: updated.id, name: updated.name, mode: 'updated' })
    } else {
      const contact = await prisma.contact.create({
        data: {
          id: targetContactId,
          updatedAt: new Date(),
          name: data.name,
          nameKana: data.nameKana || null,
          connectionType: data.connectionType || null,
          company: data.company || null,
          department: data.department || null,
          title: data.title || null,
          email: data.email || null,
          phone: data.phone || null,
          lineId: data.lineId || null,
          gmailAlias: data.gmailAlias || null,
          website: data.website || null,
          address: data.address || null,
          episodeMemo: data.episodeMemo || null,
          cardImageUrl: frontUrl,
          cardImageBackUrl: backUrl,
        },
      })
      created.push({ id: contact.id, name: contact.name, mode: 'created' })

      if (contact.company) {
        const existing = await prisma.group.findFirst({
          where: { name: contact.company, type: 'COMPANY' },
        })
        if (existing) {
          groupSuggestions.push({
            contactId: contact.id,
            groupId: existing.id,
            groupName: existing.name,
            type: 'COMPANY',
          })
        }
      }
    }
  }

  return NextResponse.json({
    count: created.length,
    created: created.filter(c => c.mode === 'created').length,
    updated: created.filter(c => c.mode === 'updated').length,
    contacts: created,
    groupSuggestions,
  })
}
