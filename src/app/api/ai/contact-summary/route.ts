import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { summarizeContact } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const { contactId } = await request.json()
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { Note: { orderBy: { createdAt: 'desc' } } } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!contact.Note.length) return NextResponse.json({ error: 'No notes' }, { status: 400 })
  const summary = await summarizeContact(contact.name, contact.company, contact.title, contact.Note)
  await prisma.contact.update({ where: { id: contactId }, data: { contactSummary: summary, contactSummaryAt: new Date() } })
  return NextResponse.json({ summary })
}
