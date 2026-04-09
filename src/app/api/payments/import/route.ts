/**
 * POST /api/payments/import
 *
 * マネーフォワードクラウド会計 or 楽天銀行の CSV をアップロードして
 * 入金取引を PaymentTransaction として取り込む。
 *
 * 取込時に自動マッチングを試み、金額一致 + 名前スコア >= 0.8 かつ
 * 候補1件なら自動で PaymentAllocation を作成し AR を消込する。
 *
 * リクエスト: multipart/form-data with `file` field (CSV)
 * 認証: NextAuth セッション
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { decodeCsvBuffer, parseMfCsv } from '@/lib/mf-csv-parser'
import { normalizePayerName, matchPaymentToAR, type MatchableAR } from '@/lib/payment-matching'
import { deriveStatusFromPayment } from '@/lib/accounts-receivable'

export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    const buf = new Uint8Array(await file.arrayBuffer())
    const text = decodeCsvBuffer(buf)
    const parsed = parseMfCsv(text)

    if (parsed.errors.length > 0) {
      return NextResponse.json({
        error: 'CSVパースエラー',
        details: parsed.errors,
      }, { status: 400 })
    }

    // 未消込 + 一部入金の AR を取得（マッチング候補）
    const openArs = await prisma.accountsReceivable.findMany({
      where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
      include: {
        Contact: { select: { id: true, name: true, nameKana: true, company: true } },
      },
    }) as unknown as MatchableAR[]

    let created = 0
    let skippedDup = 0
    let autoMatched = 0
    let needsReview = 0
    let unmatched = 0
    const resultDetails: unknown[] = []

    for (const tx of parsed.transactions) {
      // externalId は 日付+金額+名前 のハッシュ的ID（重複防止）
      const externalId = `MF_${tx.transactionDate.toISOString().slice(0,10)}_${tx.amount}_${tx.payerName.slice(0,30)}`
      const existing = await prisma.paymentTransaction.findUnique({ where: { externalId } })
      if (existing) { skippedDup++; continue }

      const normalized = normalizePayerName(tx.payerName)
      const match = matchPaymentToAR(tx.amount, normalized, openArs)

      let matchStatus: 'UNMATCHED' | 'NEEDS_REVIEW' | 'AUTO_MATCHED' = 'UNMATCHED'
      if (match.autoMatched && match.bestMatch) {
        matchStatus = 'AUTO_MATCHED'
        autoMatched++
      } else if (match.candidates.length > 0) {
        matchStatus = 'NEEDS_REVIEW'
        needsReview++
      } else {
        unmatched++
      }

      // トランザクションで PaymentTransaction + Allocation + AR 更新
      const result = await prisma.$transaction(async (tx2) => {
        const payment = await tx2.paymentTransaction.create({
          data: {
            source: 'MF',
            externalId,
            transactionDate: tx.transactionDate,
            amount: tx.amount,
            payerName: tx.payerName,
            payerNameNormalized: normalized,
            payerType: 'UNKNOWN',
            rawData: tx.rawRow,
            matchStatus,
          },
        })

        if (matchStatus === 'AUTO_MATCHED' && match.bestMatch) {
          const ar = match.bestMatch.ar
          await tx2.paymentAllocation.create({
            data: {
              paymentTransactionId: payment.id,
              accountsReceivableId: ar.id,
              allocatedAmount: tx.amount,
            },
          })
          const newPaid = ar.paidAmount + tx.amount
          const newStatus = deriveStatusFromPayment(ar.amount, newPaid, ar.status)
          await tx2.accountsReceivable.update({
            where: { id: ar.id },
            data: {
              paidAmount: newPaid,
              status: newStatus,
              paidAt: newStatus === 'PAID' ? new Date() : undefined,
            },
          })
          // local state を更新してバッチ内での二重マッチを防ぐ
          ar.paidAmount = newPaid
          ar.status = newStatus
        }

        return payment
      })

      created++
      resultDetails.push({
        id: result.id,
        date: tx.transactionDate.toISOString().slice(0, 10),
        amount: tx.amount,
        payerName: tx.payerName,
        matchStatus,
        matchedArId: match.autoMatched ? match.bestMatch?.ar.id : undefined,
        candidateCount: match.candidates.length,
      })
    }

    return NextResponse.json({
      success: true,
      format: parsed.format,
      total: parsed.transactions.length,
      created,
      skippedDup,
      skippedNonDeposit: parsed.skipped,
      autoMatched,
      needsReview,
      unmatched,
      details: resultDetails,
    })
  } catch (error: unknown) {
    console.error('Payment import error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
