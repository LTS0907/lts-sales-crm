export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import SubscriptionForm from '@/components/subscriptions/SubscriptionForm'

export default async function NewSubscriptionPage() {
  const contacts = await prisma.contact.findMany({
    where: {
      salesPhase: { in: ['CONTRACTED', 'PAID', 'STARTED'] },
    },
    select: { id: true, name: true, company: true, email: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">🔄 サブスク新規登録</h1>
      <SubscriptionForm contacts={contacts} />
    </div>
  )
}
