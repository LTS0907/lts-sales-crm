export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import BillingDashboardClient from '@/components/subscriptions/BillingDashboardClient'

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams
  const now = new Date()
  const currentMonth = sp.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const records = await prisma.billingRecord.findMany({
    where: { billingMonth: currentMonth },
    include: {
      Subscription: {
        include: {
          Contact: { select: { id: true, name: true, company: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Summary stats
  const total = records.length
  const needsInput = records.filter(r => !r.amountConfirmed).length
  const generated = records.filter(r => r.status === 'GENERATED').length
  const sent = records.filter(r => r.status === 'SENT' || r.status === 'DOWNLOADED').length
  const pending = records.filter(r => r.status === 'PENDING' && r.amountConfirmed).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📄 月次請求</h1>
          <p className="text-sm text-gray-500 mt-1">{currentMonth}</p>
        </div>
        <Link href="/subscriptions"
          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
          🔄 サブスク管理
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{total}</p>
          <p className="text-xs text-gray-500">合計</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${needsInput > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className={`text-2xl font-bold ${needsInput > 0 ? 'text-red-600' : 'text-gray-900'}`}>{needsInput}</p>
          <p className="text-xs text-gray-500">金額未入力</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pending}</p>
          <p className="text-xs text-gray-500">生成待ち</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{generated}</p>
          <p className="text-xs text-gray-500">未送信</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{sent}</p>
          <p className="text-xs text-gray-500">送信済</p>
        </div>
      </div>

      <BillingDashboardClient
        records={JSON.parse(JSON.stringify(records))}
        currentMonth={currentMonth}
      />
    </div>
  )
}
