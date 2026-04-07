import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshOverdueStatus, createReceivableWithRevenue, calcDefaultDueDate } from '@/lib/accounts-receivable'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      contactId,
      serviceName,
      invoiceSubject,
      amount,
      subtotal,
      taxAmount,
      invoicedAt,
      dueDate,
      notes,
      paidAmount,
      status,
    } = body

    if (!contactId || !serviceName || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'contactId, serviceName, amount は必須です' }, { status: 400 })
    }

    // 顧客存在確認
    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })
    }

    const invoicedAtDate = invoicedAt ? new Date(invoicedAt) : new Date()
    if (isNaN(invoicedAtDate.getTime())) {
      return NextResponse.json({ error: 'invoicedAt が不正です' }, { status: 400 })
    }

    const dueDateDate = dueDate ? new Date(dueDate) : calcDefaultDueDate(invoicedAtDate)
    if (isNaN(dueDateDate.getTime())) {
      return NextResponse.json({ error: 'dueDate が不正です' }, { status: 400 })
    }

    // AR + Revenue 作成（共通ユーティリティ使用、transaction済み）
    const result = await createReceivableWithRevenue({
      contactId,
      source: 'MANUAL',
      serviceName,
      invoiceSubject: invoiceSubject || serviceName,
      amount,
      subtotal,
      taxAmount,
      invoicedAt: invoicedAtDate,
      dueDate: dueDateDate,
      notes,
    })

    // paidAmount/status の追加処理（指定された場合）
    if ((typeof paidAmount === 'number' && paidAmount > 0) || status) {
      const updateData: Record<string, unknown> = {}
      if (typeof paidAmount === 'number' && paidAmount > 0) {
        updateData.paidAmount = paidAmount
        if (paidAmount >= amount) {
          updateData.status = 'PAID'
          updateData.paidAt = new Date()
        } else {
          updateData.status = 'PARTIAL'
        }
      }
      if (status && !updateData.status) updateData.status = status
      const updated = await prisma.accountsReceivable.update({
        where: { id: result.accountsReceivable.id },
        data: updateData,
      })
      return NextResponse.json(updated)
    }

    return NextResponse.json(result.accountsReceivable)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

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
