import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recommendServices } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const { contactId } = await request.json()
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const result = await recommendServices(contact.name, contact.company, contact.department, contact.title, contact.episodeMemo)
  await prisma.contact.update({ where: { id: contactId }, data: { recommendedServices: result.services.join(', '), serviceReason: result.reason } })
  return NextResponse.json(result)
}
