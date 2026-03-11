import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { summarizeCompany } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const { contactId } = await request.json()
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!contact.website && !contact.company) return NextResponse.json({ error: 'No website/company' }, { status: 400 })
  let text = `会社名: ${contact.company}`
  if (contact.website) {
    try {
      const res = await fetch(contact.website, { signal: AbortSignal.timeout(8000) })
      const html = await res.text()
      text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    } catch {}
  }
  const summary = await summarizeCompany(contact.company || '会社', text)
  await prisma.contact.update({ where: { id: contactId }, data: { companySummary: summary, companySummaryAt: new Date() } })
  return NextResponse.json({ summary })
}
