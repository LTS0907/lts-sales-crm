import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ notes: [], contacts: [] })
  const [notes, contacts] = await Promise.all([
    prisma.note.findMany({ where: { content: { contains: q } }, include: { contact: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.contact.findMany({ where: { OR: [{ name: { contains: q } }, { company: { contains: q } }, { title: { contains: q } }] } }),
  ])
  return NextResponse.json({ notes, contacts })
}
