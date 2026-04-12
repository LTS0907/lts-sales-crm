/**
 * POST /api/payments/[id]/resolve
 *
 * 未消込の入金に対して「その他売上」または「対象外」として処理する。
 *
 * Body:
 *  {
 *    action: 'OTHER_REVENUE' | 'IGNORED',
 *    note?: string,          // 理由メモ（任意）
 *    serviceName?: string,   // OTHER_REVENUE時の売上件名（デフォルト: "その他売上"）
 *  }
 *
 * OTHER_REVENUE: Revenue レコードを作成し、matchStatus を 'OTHER_REVENUE' に更新
 * IGNORED: matchStatus を 'IGNORED' に更新（売上計上なし）
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toFiscalMonth } from '@/lib/accounts-receivable'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json() as {
      action: 'OTHER_REVENUE' | 'IGNORED'
      note?: string
      serviceName?: string
    }

    if (body.action !== 'OTHER_REVENUE' && body.action !== 'IGNORED') {
      return NextResponse.json({ error: 'action must be OTHER_REVENUE or IGNORED' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({ where: { id } })
      if (!payment) throw new Error('Payment not found')
      if (payment.direction !== 'IN') throw new Error('出金は処理対象外です')
      if (payment.matchStatus === 'MANUAL_MATCHED' || payment.matchStatus === 'AUTO_MATCHED') {
        throw new Error('既に消込済みの入金です')
      }

      if (body.action === 'OTHER_REVENUE') {
        // Revenue を直接作成（AR を経由しない）
        const recognizedAt = payment.transactionDate
        const totalAmount = payment.amount
        const subtotal = Math.floor(totalAmount / 1.1)
        const taxAmount = totalAmount - subtotal
        const fiscalMonth = toFiscalMonth(recognizedAt)
        const serviceName = body.serviceName || 'その他売上'

        // 「その他売上」用の特殊Contact を upsert（FK制約対策）
        const otherContactId = 'OTHER_REVENUE'
        await tx.contact.upsert({
          where: { id: otherContactId },
          create: {
            id: otherContactId,
            name: 'その他売上',
            updatedAt: new Date(),
          },
          update: {},
        })

        // AR を作成して Revenue と紐付ける（会計上の整合性のため）
        const ar = await tx.accountsReceivable.create({
          data: {
            contactId: 'OTHER_REVENUE', // 特殊ID
            source: 'MANUAL',
            serviceName,
            invoiceSubject: `${serviceName} — ${payment.payerName}`,
            subtotal,
            taxAmount,
            amount: totalAmount,
            paidAmount: totalAmount,
            invoicedAt: recognizedAt,
            dueDate: recognizedAt,
            paidAt: new Date(),
            status: 'PAID',
            notes: body.note || null,
          },
        })

        await tx.revenue.create({
          data: {
            accountsReceivableId: ar.id,
            contactId: 'OTHER_REVENUE',
            serviceName,
            subtotal,
            taxAmount,
            totalAmount,
            recognizedAt,
            fiscalMonth,
          },
        })

        // 入金と AR を紐付け
        await tx.paymentAllocation.create({
          data: {
            paymentTransactionId: payment.id,
            accountsReceivableId: ar.id,
            allocatedAmount: totalAmount,
          },
        })

        await tx.paymentTransaction.update({
          where: { id },
          data: {
            matchStatus: 'OTHER_REVENUE',
            reviewNote: body.note || null,
          },
        })

        return { action: 'OTHER_REVENUE', arId: ar.id, amount: totalAmount }
      }

      // IGNORED
      await tx.paymentTransaction.update({
        where: { id },
        data: {
          matchStatus: 'IGNORED',
          reviewNote: body.note || null,
        },
      })

      return { action: 'IGNORED' }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
