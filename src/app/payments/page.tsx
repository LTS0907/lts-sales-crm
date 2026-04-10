export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import PaymentsClient from '@/components/payments/PaymentsClient'

export default async function PaymentsPage() {
  const [payments, ars, latestWithBalance] = await Promise.all([
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
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    }),
    prisma.accountsReceivable.findMany({
      where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
      include: {
        Contact: { select: { id: true, name: true, nameKana: true, company: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
    }),
    // 最新の残高を取得（balance が設定されている最新取引）
    prisma.paymentTransaction.findFirst({
      where: { balance: { not: null } },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      select: { balance: true, transactionDate: true },
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
          マネーフォワード / 楽天銀行のCSVをアップロードして口座の入出金を確認・売掛金を消込します。
        </p>
      </div>
      <PaymentsClient
        payments={serialized}
        arsForMatching={serializedArs}
        latestBalance={latestWithBalance?.balance ?? null}
        latestBalanceDate={latestWithBalance?.transactionDate.toISOString() ?? null}
      />
    </div>
  )
}
