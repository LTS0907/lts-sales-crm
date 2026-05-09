export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import SubscriptionsListClient, {
  type SubscriptionListItem,
} from '@/components/subscriptions/SubscriptionsListClient'

export default async function SubscriptionsPage() {
  const rawSubs = await prisma.subscription.findMany({
    include: {
      Contact: { select: { id: true, name: true, company: true, email: true } },
      BillingRecord: { orderBy: { billingMonth: 'desc' }, take: 1 },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  // Date 型をシリアライズして Client Component に渡せる形に変換
  const subscriptions: SubscriptionListItem[] = rawSubs.map(sub => ({
    id: sub.id,
    serviceName: sub.serviceName,
    billingType: sub.billingType,
    billingCycle: (sub as Record<string, unknown>).billingCycle as string,
    fixedAmount: sub.fixedAmount,
    status: sub.status,
    invoiceSubject: sub.invoiceSubject,
    Contact: {
      id: sub.Contact.id,
      name: sub.Contact.name,
      company: sub.Contact.company,
      email: sub.Contact.email,
    },
    BillingRecord: sub.BillingRecord.map(br => ({
      billingMonth: br.billingMonth,
      status: br.status,
    })),
  }))

  const activeCount = subscriptions.filter(s => s.status === 'ACTIVE').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">サブスク管理</h1>
          <p className="text-sm text-gray-500 mt-1">アクティブ: {activeCount}件</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/subscriptions/billing"
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            月次請求
          </Link>
          <Link
            href="/subscriptions/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + 新規登録
          </Link>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">サブスクリプションがまだ登録されていません</p>
          <Link
            href="/subscriptions/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + 新規登録
          </Link>
        </div>
      ) : (
        <SubscriptionsListClient subscriptions={subscriptions} />
      )}
    </div>
  )
}
