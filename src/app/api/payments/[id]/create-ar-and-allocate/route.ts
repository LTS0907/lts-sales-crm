/**
 * POST /api/payments/[id]/create-ar-and-allocate
 *
 * 未消込入金に対して、Contact を指定して新規 AR を作成し、即座に消込する。
 * 売掛を立てていなかった入金に対して、後から AR を作って消込するフロー。
 *
 * Body:
 *  {
 *    contactId: string,        // 既存の Contact ID
 *    serviceName: string,      // サービス名（例: "IT内製化支援"）
 *    invoiceSubject?: string,  // 件名（省略時は serviceName）
 *    amount?: number,          // AR金額（省略時は入金額と同額）
 *    invoicedAt?: string,      // 請求日（省略時は入金日）
 *  }
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createReceivableWithRevenue, calcDefaultDueDate } from '@/lib/accounts-receivable'
import { deriveStatusFromPayment } from '@/lib/accounts-receivable'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json() as {
      contactId: string
      serviceName: string
      invoiceSubject?: string
      amount?: number
      invoicedAt?: string
    }

    if (!body.contactId || !body.serviceName) {
      return NextResponse.json({ error: 'contactId and serviceName are required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({
        where: { id },
        include: { Allocations: true },
      })
      if (!payment) throw new Error('Payment not found')
      if (payment.direction !== 'IN') throw new Error('出金は処理対象外です')

      const contact = await tx.contact.findUnique({ where: { id: body.contactId } })
      if (!contact) throw new Error('Contact not found')

      const allocatedSum = payment.Allocations.reduce((s, a) => s + a.allocatedAmount, 0)
      const paymentRemaining = payment.amount - allocatedSum
      if (paymentRemaining <= 0) throw new Error('この入金は既に全額割当済みです')

      const arAmount = body.amount ?? paymentRemaining
      const invoicedAt = body.invoicedAt ? new Date(body.invoicedAt) : payment.transactionDate

      // AR + Revenue 作成
      const { accountsReceivable: ar } = await createReceivableWithRevenue({
        contactId: body.contactId,
        serviceName: body.serviceName,
        invoiceSubject: body.invoiceSubject || body.serviceName,
        amount: arAmount,
        invoicedAt,
        source: 'MANUAL',
      }, tx)

      // 即消込
      const allocAmount = Math.min(paymentRemaining, arAmount)
      await tx.paymentAllocation.create({
        data: {
          paymentTransactionId: payment.id,
          accountsReceivableId: ar.id,
          allocatedAmount: allocAmount,
        },
      })

      // AR 更新
      const newPaidAmount = ar.paidAmount + allocAmount
      const arStatus = deriveStatusFromPayment(ar.amount, newPaidAmount, ar.status)
      await tx.accountsReceivable.update({
        where: { id: ar.id },
        data: {
          paidAmount: newPaidAmount,
          status: arStatus,
          paidAt: arStatus === 'PAID' ? new Date() : undefined,
        },
      })

      // Payment 更新
      const newAllocatedSum = allocatedSum + allocAmount
      const newMatchStatus = newAllocatedSum >= payment.amount ? 'MANUAL_MATCHED' : 'NEEDS_REVIEW'
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: { matchStatus: newMatchStatus },
      })

      return {
        arId: ar.id,
        allocatedAmount: allocAmount,
        arStatus,
        paymentMatchStatus: newMatchStatus,
      }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
