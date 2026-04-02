export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SubscriptionDetailClient from '@/components/subscriptions/SubscriptionDetailClient'

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      Contact: { select: { id: true, name: true, company: true, email: true } },
      BillingRecord: { orderBy: { billingMonth: 'desc' } },
    },
  })

  if (!subscription) return notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/subscriptions" className="text-sm text-gray-500 hover:underline">← サブスク管理</Link>
      </div>

      <SubscriptionDetailClient subscription={JSON.parse(JSON.stringify(subscription))} />
    </div>
  )
}
