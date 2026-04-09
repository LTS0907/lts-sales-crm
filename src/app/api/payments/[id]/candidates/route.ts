/**
 * GET /api/payments/[id]/candidates
 * 入金取引に対する AR マッチング候補を返す（金額一致を優先、次いで近額）
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchPaymentToAR, type MatchableAR, nameSimilarity, normalizePayerName } from '@/lib/payment-matching'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payment = await prisma.paymentTransaction.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const ars = await prisma.accountsReceivable.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
    include: {
      Contact: { select: { id: true, name: true, nameKana: true, company: true } },
    },
  }) as unknown as MatchableAR[]

  // まず金額完全一致
  const amountMatch = matchPaymentToAR(payment.amount, payment.payerNameNormalized, ars)

  // 近額（残額が入金の ±20%）も候補として返す（金額違いの可能性）
  const nearCandidates = ars
    .filter(ar => {
      const remaining = ar.amount - ar.paidAmount
      if (remaining === payment.amount) return false // 既にamountMatchに含まれる
      const diff = Math.abs(remaining - payment.amount)
      return diff / payment.amount <= 0.2
    })
    .map(ar => {
      const cn = normalizePayerName(ar.Contact.company || '')
      const kn = normalizePayerName(ar.Contact.nameKana || '')
      const nm = normalizePayerName(ar.Contact.name || '')
      const score = Math.max(
        nameSimilarity(payment.payerNameNormalized, cn),
        nameSimilarity(payment.payerNameNormalized, kn),
        nameSimilarity(payment.payerNameNormalized, nm),
      )
      return { ar, score, reason: 'near-amount' }
    })
    .filter(c => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)

  return NextResponse.json({
    paymentId: payment.id,
    payerName: payment.payerName,
    payerNameNormalized: payment.payerNameNormalized,
    amount: payment.amount,
    exactMatches: amountMatch.candidates,
    nearMatches: nearCandidates,
  })
}
