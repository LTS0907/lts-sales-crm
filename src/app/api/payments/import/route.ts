/**
 * POST /api/payments/import
 *
 * マネーフォワードクラウド会計 or 楽天銀行の CSV をアップロードして
 * 入出金取引を PaymentTransaction として取り込む。
 *
 * - 入金(IN): AR 自動マッチングを試みる
 * - 出金(OUT): matchStatus=IGNORED で保存のみ（AR対象外）
 * - 残高があれば balance に保存
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

    // 未消込の AR を取得（マッチング候補）
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
    let outCreated = 0

    for (const tx of parsed.transactions) {
      const externalId = `MF_${tx.transactionDate.toISOString().slice(0,10)}_${tx.direction}_${tx.amount}_${tx.payerName.slice(0,30)}`
      const existing = await prisma.paymentTransaction.findUnique({ where: { externalId } })
      if (existing) { skippedDup++; continue }

      const normalized = normalizePayerName(tx.payerName)

      // 出金はマッチングしない
      if (tx.direction === 'OUT') {
        await prisma.paymentTransaction.create({
          data: {
            source: 'MF',
            externalId,
            transactionDate: tx.transactionDate,
            direction: 'OUT',
            amount: tx.amount,
            balance: tx.balance,
            description: tx.description,
            payerName: tx.payerName,
            payerNameNormalized: normalized,
            payerType: 'UNKNOWN',
            rawData: tx.rawRow,
            matchStatus: 'IGNORED',
          },
        })
        outCreated++
        created++
        continue
      }

      // 入金 → マッチング候補を探す（自動消込はしない）
      const match = matchPaymentToAR(tx.amount, normalized, openArs)

      let matchStatus: 'UNMATCHED' | 'NEEDS_REVIEW' = 'UNMATCHED'
      if (match.candidates.length > 0) {
        matchStatus = 'NEEDS_REVIEW'
        needsReview++
      } else {
        unmatched++
      }

      await prisma.$transaction(async (tx2) => {
        const payment = await tx2.paymentTransaction.create({
          data: {
            source: 'MF',
            externalId,
            transactionDate: tx.transactionDate,
            direction: 'IN',
            amount: tx.amount,
            balance: tx.balance,
            description: tx.description,
            payerName: tx.payerName,
            payerNameNormalized: normalized,
            payerType: 'UNKNOWN',
            rawData: tx.rawRow,
            matchStatus,
          },
        })

        // 自動消込は行わない — ユーザーが /payments 画面で確認後に手動消込
        void payment
      })

      created++
    }

    return NextResponse.json({
      success: true,
      format: parsed.format,
      total: parsed.transactions.length,
      created,
      outCreated,
      inCreated: created - outCreated,
      skippedDup,
      skippedNonDeposit: parsed.skipped,
      autoMatched,
      needsReview,
      unmatched,
    })
  } catch (error: unknown) {
    console.error('Payment import error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
