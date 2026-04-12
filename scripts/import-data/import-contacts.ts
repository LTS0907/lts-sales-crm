import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

interface SheetData {
  values: string[][]
}

function clean(v: string | undefined): string | null {
  if (!v || v.trim() === '') return null
  return v.trim()
}

function cleanZip(z: string | undefined): string | null {
  if (!z || z.trim() === '') return null
  return z.replace(/^〒/, '').trim()
}

function buildAddress(zip: string | null, address: string | null): string | null {
  if (!address) return null
  if (zip) return `〒${zip} ${address}`
  return address
}

function generateId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 25)
}

async function main() {
  console.log('📂 シートデータ読み込み中...')
  const data: SheetData = JSON.parse(
    readFileSync('D:/scripts/lts-sales-crm/scripts/import-data/sheet-data.json', 'utf8')
  )

  const rows = data.values.slice(1) // ヘッダー除外
  console.log(`データ行数: ${rows.length}件`)

  let imported = 0
  let skipped = 0
  let errors = 0
  const errorLog: { row: number; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const [
      company, department, title, name, email,
      zip, addressRaw, website, phone, mobile, fax,
      other, loadDate, fileId, episodeMemo, firstMailStatus, fileUrl
    ] = row

    // 必須: 氏名 or 会社名のどちらかは必要
    if (!name?.trim() && !company?.trim()) {
      skipped++
      continue
    }

    try {
      // 重複チェック（email or company+name）
      let existing = null
      if (email && email.trim()) {
        existing = await prisma.contact.findFirst({
          where: { email: email.trim() },
        })
      }
      if (!existing && name?.trim()) {
        existing = await prisma.contact.findFirst({
          where: { name: name.trim(), company: company?.trim() || null },
        })
      }
      if (existing) {
        skipped++
        continue
      }

      const now = new Date()
      await prisma.contact.create({
        data: {
          id: generateId(),
          updatedAt: now,
          name: clean(name) || '(名前なし)',
          company: clean(company),
          department: clean(department),
          title: clean(title),
          email: clean(email),
          phone: clean(phone) || clean(mobile),
          website: clean(website),
          address: buildAddress(cleanZip(zip), clean(addressRaw)),
          episodeMemo: clean(episodeMemo) || clean(other),
          emailStatus: firstMailStatus?.includes('完了') ? 'SENT' : 'UNSENT',
          salesPhase: 'LEAD',
        },
      })
      imported++
      if (imported % 50 === 0) console.log(`  ${imported}件 取り込み済み...`)
    } catch (err) {
      errors++
      const msg = err instanceof Error ? err.message : String(err)
      errorLog.push({ row: i + 2, reason: msg.slice(0, 100) })
    }
  }

  console.log('\n📊 結果:')
  console.log(`  ✅ 新規取り込み: ${imported}件`)
  console.log(`  ⏭  スキップ（既存/空）: ${skipped}件`)
  console.log(`  ❌ エラー: ${errors}件`)
  if (errorLog.length > 0) {
    console.log('\nエラー詳細（最初の5件）:')
    errorLog.slice(0, 5).forEach(e => console.log(`  行${e.row}: ${e.reason}`))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
