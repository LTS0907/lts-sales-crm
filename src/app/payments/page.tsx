export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import PaymentsClient from '@/components/payments/PaymentsClient'

export default async function PaymentsPage() {
  const [payments, ars] = await Promise.all([
    prisma.paymentTransaction.findMany({
      include: {
        Allocations: {
          include: {
            AccountsReceivable: {
              include: { Contact: { select: { id: true, name: true, company: true } } },
            },
          },
        },
      },
      orderBy: [{ matchStatus: 'asc' }, { transactionDate: 'desc' }],
      take: 500,
    }),
    prisma.accountsReceivable.findMany({
      where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
      include: {
        Contact: { select: { id: true, name: true, nameKana: true, company: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
    }),
  ])

  const serialized = payments.map(p => ({
    ...p,
    transactionDate: p.transactionDate.toISOString(),
    createdAt: p.createdAt.toISOString(),
    Allocations: p.Allocations.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      AccountsReceivable: {
        ...a.AccountsReceivable,
        createdAt: a.AccountsReceivable.createdAt.toISOString(),
        updatedAt: a.AccountsReceivable.updatedAt.toISOString(),
        invoicedAt: a.AccountsReceivable.invoicedAt.toISOString(),
        dueDate: a.AccountsReceivable.dueDate.toISOString(),
        paidAt: a.AccountsReceivable.paidAt?.toISOString() ?? null,
      },
    })),
  }))

  const serializedArs = ars.map(a => ({
    id: a.id,
    contactId: a.contactId,
    serviceName: a.serviceName,
    invoiceSubject: a.invoiceSubject,
    amount: a.amount,
    paidAmount: a.paidAmount,
    invoicedAt: a.invoicedAt.toISOString(),
    dueDate: a.dueDate.toISOString(),
    status: a.status,
    Contact: a.Contact,
  }))

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">入金・消込管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          マネーフォワード / 楽天銀行のCSVをアップロードして売掛金を自動消込します。
        </p>
      </div>
      <PaymentsClient payments={serialized} arsForMatching={serializedArs} />
    </div>
  )
}
