export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { refreshOverdueStatus } from '@/lib/accounts-receivable'
import ReceivablesList from '@/components/ar/ReceivablesList'

export default async function AccountsReceivablePage() {
  await refreshOverdueStatus()

  const [items, contacts] = await Promise.all([
    prisma.accountsReceivable.findMany({
      include: {
        Contact: { select: { id: true, name: true, company: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true },
      orderBy: [{ company: 'asc' }, { name: 'asc' }],
    }),
  ])

  // シリアライズ（DateをISO文字列化）
  const serialized = items.map(i => ({
    ...i,
    invoicedAt: i.invoicedAt.toISOString(),
    dueDate: i.dueDate.toISOString(),
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }))

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">売掛金管理</h1>
        <p className="text-sm text-gray-500 mt-1">請求書発行で自動登録。手動追加・入金確認後の消込もできます。</p>
      </div>
      <ReceivablesList items={serialized} contacts={contacts} />
    </div>
  )
}
