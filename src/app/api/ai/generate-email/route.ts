import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateEmail } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const { contactId } = await request.json()
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const email = await generateEmail(contact.name, contact.company, contact.department, contact.title, contact.episodeMemo, contact.recommendedServices)
  await prisma.contact.update({ where: { id: contactId }, data: { emailSubject: email.subject, emailBody: email.body, emailStatus: 'DRAFTED' } })
  return NextResponse.json(email)
}
