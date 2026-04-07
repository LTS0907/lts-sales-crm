import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshOverdueStatus } from '@/lib/accounts-receivable'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // OPEN / PARTIAL / PAID / OVERDUE / WRITTEN_OFF / ALL
  const contactId = searchParams.get('contactId')

  // 期日超過のARを自動OVERDUE化
  await refreshOverdueStatus()

  const where: Record<string, unknown> = {}
  if (contactId) where.contactId = contactId
  if (status && status !== 'ALL') {
    if (status === 'UNPAID') {
      where.status = { in: ['OPEN', 'PARTIAL', 'OVERDUE'] }
    } else {
      where.status = status
    }
  }

  const items = await prisma.accountsReceivable.findMany({
    where,
    include: {
      Contact: { select: { id: true, name: true, company: true, email: true } },
      Allocations: {
        include: {
          PaymentTransaction: { select: { id: true, transactionDate: true, amount: true, payerName: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
  })

  // サマリー
  const summary = {
    totalCount: items.length,
    openAmount: items.filter(i => i.status === 'OPEN' || i.status === 'PARTIAL').reduce((s, i) => s + (i.amount - i.paidAmount), 0),
    overdueAmount: items.filter(i => i.status === 'OVERDUE').reduce((s, i) => s + (i.amount - i.paidAmount), 0),
    paidAmount: items.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0),
  }

  return NextResponse.json({ items, summary })
}
