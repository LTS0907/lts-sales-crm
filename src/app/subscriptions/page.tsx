export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'

const statusLabels: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '有効', color: 'bg-green-100 text-green-700' },
  PAUSED: { label: '一時停止', color: 'bg-yellow-100 text-yellow-700' },
  CANCELLED: { label: '解約済', color: 'bg-gray-100 text-gray-500' },
}

const billingTypeLabels: Record<string, { label: string; color: string }> = {
  FIXED: { label: '固定額', color: 'bg-blue-100 text-blue-700' },
  VARIABLE: { label: '変動額', color: 'bg-orange-100 text-orange-700' },
}

export default async function SubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      Contact: { select: { id: true, name: true, company: true, email: true } },
      BillingRecord: { orderBy: { billingMonth: 'desc' }, take: 1 },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const activeCount = subscriptions.filter(s => s.status === 'ACTIVE').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🔄 サブスク管理</h1>
          <p className="text-sm text-gray-500 mt-1">アクティブ: {activeCount}件</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/subscriptions/billing"
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            📄 月次請求
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">顧客</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">サービス</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">種別</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">月額</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">ステータス</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">直近請求</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map(sub => {
                const st = statusLabels[sub.status] || { label: sub.status, color: 'bg-gray-100' }
                const bt = billingTypeLabels[sub.billingType] || { label: sub.billingType, color: 'bg-gray-100' }
                const lastBilling = sub.BillingRecord[0]

                return (
                  <tr key={sub.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${sub.Contact.id}`} className="hover:underline">
                        <p className="text-sm font-medium text-gray-900">{sub.Contact.name}</p>
                        {sub.Contact.company && (
                          <p className="text-xs text-gray-500">{sub.Contact.company}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{sub.serviceName}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bt.color}`}>
                        {bt.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {sub.billingType === 'FIXED' && sub.fixedAmount
                        ? `¥${sub.fixedAmount.toLocaleString()}`
                        : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {lastBilling ? `${lastBilling.billingMonth} (${lastBilling.status})` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/subscriptions/${sub.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
