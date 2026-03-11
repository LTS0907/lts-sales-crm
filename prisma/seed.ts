import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const contacts = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data-contacts.json'), 'utf-8'))
const notes = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data-notes.json'), 'utf-8'))
const servicePhases = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data-servicePhases.json'), 'utf-8'))

const prisma = new PrismaClient()

function toDate(val: number | string | null): Date | null {
  if (!val) return null
  return new Date(Number(val))
}

async function main() {
  console.log(`Seeding ${contacts.length} contacts...`)

  for (const c of contacts as any[]) {
    await prisma.contact.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        createdAt: toDate(c.createdAt) ?? new Date(),
        updatedAt: toDate(c.updatedAt) ?? new Date(),
        name: c.name,
        nameKana: c.nameKana || null,
        company: c.company || null,
        department: c.department || null,
        title: c.title || null,
        email: c.email || null,
        phone: c.phone || null,
        lineId: c.lineId || null,
        gmailAlias: c.gmailAlias || null,
        website: c.website || null,
        address: c.address || null,
        photoPath: c.photoPath || null,
        cardImageUrl: c.cardImageUrl || null,
        episodeMemo: c.episodeMemo || null,
        contactSummary: c.contactSummary || null,
        contactSummaryAt: toDate(c.contactSummaryAt),
        companySummary: c.companySummary || null,
        companySummaryAt: toDate(c.companySummaryAt),
        recommendedServices: c.recommendedServices || null,
        serviceReason: c.serviceReason || null,
        emailSubject: c.emailSubject || null,
        emailBody: c.emailBody || null,
        emailStatus: c.emailStatus || 'UNSENT',
        emailSentAt: toDate(c.emailSentAt),
        followUpText: c.followUpText || null,
        followUpStatus: c.followUpStatus || 'NOT_SET',
        followUpDate: toDate(c.followUpDate),
        salesPhase: c.salesPhase || 'LEAD',
        nextAction: c.nextAction || null,
        touchNumber: c.touchNumber || 0,
      },
    })
  }

  console.log(`Seeding ${notes.length} notes...`)
  for (const n of notes as any[]) {
    await prisma.note.upsert({
      where: { id: n.id },
      update: {},
      create: {
        id: n.id,
        createdAt: toDate(n.createdAt) ?? new Date(),
        updatedAt: toDate(n.updatedAt) ?? new Date(),
        content: n.content,
        category: n.category || 'GENERAL',
        contactId: n.contactId,
      },
    })
  }

  console.log(`Seeding ${servicePhases.length} service phases...`)
  for (const s of servicePhases as any[]) {
    await prisma.servicePhase.upsert({
      where: { contactId_service: { contactId: s.contactId, service: s.service } },
      update: {},
      create: {
        id: s.id,
        contactId: s.contactId,
        service: s.service,
        phase: s.phase,
        updatedAt: toDate(s.updatedAt) ?? new Date(),
      },
    })
  }

  console.log('Seed completed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
