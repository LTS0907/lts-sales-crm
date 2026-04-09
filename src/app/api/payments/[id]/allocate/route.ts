/**
 * POST /api/payments/[id]/allocate
 * 入金取引を手動で売掛金に割り当てる（消込）
 *
 * Body:
 *  { accountsReceivableId: string, allocatedAmount?: number }
 *  allocatedAmount 省略時は「残額」と「入金の残り」の小さい方
 *
 * DELETE /api/payments/[id]/allocate?arId=xxx
 * 指定の割当を取り消す
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveStatusFromPayment } from '@/lib/accounts-receivable'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json() as { accountsReceivableId: string; allocatedAmount?: number }
    const { accountsReceivableId } = body

    if (!accountsReceivableId) {
      return NextResponse.json({ error: 'accountsReceivableId required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({
        where: { id },
        include: { Allocations: true },
      })
      if (!payment) throw new Error('Payment not found')

      const ar = await tx.accountsReceivable.findUnique({ where: { id: accountsReceivableId } })
      if (!ar) throw new Error('AR not found')

      // 既存のこのペアの割当を取得（再割当は禁止）
      const existingAlloc = payment.Allocations.find(a => a.accountsReceivableId === accountsReceivableId)
      if (existingAlloc) {
        throw new Error('Already allocated to this AR')
      }

      // 入金の残り割当可能額
      const allocatedSum = payment.Allocations.reduce((s, a) => s + a.allocatedAmount, 0)
      const paymentRemaining = payment.amount - allocatedSum
      if (paymentRemaining <= 0) {
        throw new Error('この入金は既に全額割当済みです')
      }

      // ARの残額
      const arRemaining = ar.amount - ar.paidAmount
      if (arRemaining <= 0) {
        throw new Error('この売掛金は既に完済されています')
      }

      // デフォルト割当額: min(入金残り, AR残り)
      let alloc = body.allocatedAmount
      if (alloc === undefined) alloc = Math.min(paymentRemaining, arRemaining)
      if (alloc <= 0 || alloc > paymentRemaining || alloc > arRemaining) {
        throw new Error('割当額が不正です')
      }

      await tx.paymentAllocation.create({
        data: {
          paymentTransactionId: payment.id,
          accountsReceivableId: ar.id,
          allocatedAmount: alloc,
        },
      })

      // AR 更新
      const newPaidAmount = ar.paidAmount + alloc
      const newStatus = deriveStatusFromPayment(ar.amount, newPaidAmount, ar.status)
      await tx.accountsReceivable.update({
        where: { id: ar.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
          paidAt: newStatus === 'PAID' ? new Date() : undefined,
        },
      })

      // Payment の matchStatus を更新
      const newAllocatedSum = allocatedSum + alloc
      const newMatchStatus =
        newAllocatedSum >= payment.amount ? 'MANUAL_MATCHED' : 'NEEDS_REVIEW'
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: { matchStatus: newMatchStatus },
      })

      return {
        paymentId: payment.id,
        arId: ar.id,
        allocatedAmount: alloc,
        arNewStatus: newStatus,
        arNewPaidAmount: newPaidAmount,
        paymentMatchStatus: newMatchStatus,
      }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const arId = url.searchParams.get('arId')
  if (!arId) {
    return NextResponse.json({ error: 'arId query param required' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const alloc = await tx.paymentAllocation.findUnique({
        where: {
          paymentTransactionId_accountsReceivableId: {
            paymentTransactionId: id,
            accountsReceivableId: arId,
          },
        },
      })
      if (!alloc) throw new Error('Allocation not found')

      await tx.paymentAllocation.delete({ where: { id: alloc.id } })

      // AR の paidAmount を戻す
      const ar = await tx.accountsReceivable.findUnique({ where: { id: arId } })
      if (ar) {
        const newPaidAmount = Math.max(0, ar.paidAmount - alloc.allocatedAmount)
        const newStatus = deriveStatusFromPayment(ar.amount, newPaidAmount, ar.status)
        await tx.accountsReceivable.update({
          where: { id: arId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
            paidAt: newStatus === 'PAID' ? ar.paidAt : null,
          },
        })
      }

      // Payment の matchStatus を戻す
      const remaining = await tx.paymentAllocation.findMany({
        where: { paymentTransactionId: id },
      })
      const newMatchStatus = remaining.length === 0 ? 'UNMATCHED' : 'NEEDS_REVIEW'
      await tx.paymentTransaction.update({
        where: { id },
        data: { matchStatus: newMatchStatus },
      })

      return { removed: alloc.allocatedAmount }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
