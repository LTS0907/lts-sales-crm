import { prisma } from '@/lib/prisma'
import EmailsClient from '@/components/crm/EmailsClient'

export default async function EmailsPage() {
  const contacts = await prisma.contact.findMany({
    where: { emailStatus: { in: ['DRAFTED', 'APPROVED', 'SENT'] } },
    orderBy: { updatedAt: 'desc' },
  })
  return <EmailsClient contacts={contacts} />
}
