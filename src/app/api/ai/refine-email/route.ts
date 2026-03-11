import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refineEmail } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const { contactId, subject, body, instruction } = await request.json()
  const email = await refineEmail(subject, body, instruction)
  await prisma.contact.update({ where: { id: contactId }, data: { emailSubject: email.subject, emailBody: email.body } })
  return NextResponse.json(email)
}
