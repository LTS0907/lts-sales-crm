import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import ContactDetailClient from '@/components/contacts/ContactDetailClient'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [contact, allContacts] = await Promise.all([
    prisma.contact.findUnique({
      where: { id },
      include: { notes: { orderBy: { createdAt: 'desc' } }, exchanges: { orderBy: { createdAt: 'desc' } }, meetings: { include: { meeting: true } }, groupMembers: { include: { group: true } }, servicePhases: true },
    }),
    prisma.contact.findMany({ select: { id: true, name: true } }),
  ])
  if (!contact) notFound()
  return <ContactDetailClient contact={contact} allContacts={allContacts} />
}
