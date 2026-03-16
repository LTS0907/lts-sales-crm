import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get('q')
  const contacts = await prisma.contact.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { company: { contains: q } }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { Note: true } } },
  })
  return NextResponse.json(contacts)
}

export async function POST(request: NextRequest) {
  const data = await request.json()
  const contact = await prisma.contact.create({
    data: { id: data.id || crypto.randomUUID(), updatedAt: new Date(), name: data.name, nameKana: data.nameKana, connectionType: data.connectionType || null, company: data.company, department: data.department, title: data.title, email: data.email, phone: data.phone, lineId: data.lineId, gmailAlias: data.gmailAlias, website: data.website, address: data.address, episodeMemo: data.episodeMemo },
  })
  let groupSuggestion = null
  if (contact.company) {
    const existing = await prisma.group.findFirst({ where: { name: contact.company, type: 'COMPANY' } })
    if (existing) {
      groupSuggestion = { groupId: existing.id, groupName: existing.name, type: 'COMPANY', message: `「${contact.company}」グループに追加しますか？` }
    } else {
      const same = await prisma.contact.count({ where: { company: contact.company, id: { not: contact.id } } })
      if (same > 0) groupSuggestion = { groupId: null, groupName: contact.company, type: 'COMPANY', message: `「${contact.company}」グループを作成して追加しますか？` }
    }
  }
  return NextResponse.json({ contact, groupSuggestion })
}
