/**
 * POST /api/payments/import-json
 *
 * MF Cloud Accounting MCP サーバーから取得した仕訳データを
 * JSON配列として直接受け取り、PaymentTransaction として取り込む。
 *
 * CSV 版 (/api/payments/import) と違い、以下の利点:
 *  - Shift_JIS エンコーディング不要
 *  - 列名検出不要（フィールド固定）
 *  - OAuth認証によりユーザー単位でセキュア
 *  - 日付範囲指定で部分取込可能（重複は externalId で防止）
 *
 * リクエスト形式:
 * {
 *   "source": "MF_MCP",
 *   "transactions": [
 *     {
 *       "externalId": "MF_JE_12345",            // 仕訳ID など一意な値
 *       "transactionDate": "2026-04-10",
 *       "direction": "IN" | "OUT",
 *       "amount": 150000,                        // 正の値
 *       "balance": 12345678,                     // 取引後残高（任意）
 *       "payerName": "リバテイホ-ム(カ",
 *       "description": "振込 リバテイホ-ム(カ",
 *       "rawData": { ... }                       // 任意の元データ
 *     }
 *   ]
 * }
 *
 * 認証: Bearer CRON_API_SECRET（UI/スクリプト両対応）
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizePayerName, matchPaymentToAR, type MatchableAR } from '@/lib/payment-matching'
import { deriveStatusFromPayment } from '@/lib/accounts-receivable'

export const maxDuration = 60

interface IncomingTransaction {
  externalId: string
  transactionDate: string
  direction: 'IN' | 'OUT'
  amount: number
  balance?: number | null
  payerName: string
  description?: string | null
  rawData?: unknown
}

interface RequestBody {
  source?: string
  transactions: IncomingTransaction[]
}

export async function POST(request: Request) {
  // 認証: CRON_API_SECRET による Bearer
  const auth = request.headers.get('Authorization')
  const expected = process.env.CRON_API_SECRET
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as RequestBody
    if (!body || !Array.isArray(body.transactions)) {
      return NextResponse.json({ error: 'transactions array required' }, { status: 400 })
    }
    const source = body.source || 'MF_MCP'

    // 未消込の AR を取得
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
    const errors: string[] = []

    for (const tx of body.transactions) {
      // バリデーション
      if (!tx.externalId || !tx.transactionDate || !tx.direction || !tx.amount) {
        errors.push(`invalid transaction: ${JSON.stringify(tx).slice(0, 100)}`)
        continue
      }
      if (tx.direction !== 'IN' && tx.direction !== 'OUT') {
        errors.push(`invalid direction: ${tx.direction}`)
        continue
      }
      const date = new Date(tx.transactionDate)
      if (isNaN(date.getTime())) {
        errors.push(`invalid date: ${tx.transactionDate}`)
        continue
      }

      const existing = await prisma.paymentTransaction.findUnique({
        where: { externalId: tx.externalId },
      })
      if (existing) { skippedDup++; continue }

      const normalized = normalizePayerName(tx.payerName || '')

      // OUT: 消込対象外で保存のみ
      if (tx.direction === 'OUT') {
        await prisma.paymentTransaction.create({
          data: {
            source,
            externalId: tx.externalId,
            transactionDate: date,
            direction: 'OUT',
            amount: Math.abs(tx.amount),
            balance: tx.balance ?? null,
            description: tx.description ?? null,
            payerName: tx.payerName || '不明',
            payerNameNormalized: normalized,
            payerType: 'UNKNOWN',
            rawData: (tx.rawData as object) ?? undefined,
            matchStatus: 'IGNORED',
          },
        })
        outCreated++
        created++
        continue
      }

      // IN: マッチング試行
      const match = matchPaymentToAR(Math.abs(tx.amount), normalized, openArs)
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

      await prisma.$transaction(async (tx2) => {
        const payment = await tx2.paymentTransaction.create({
          data: {
            source,
            externalId: tx.externalId,
            transactionDate: date,
            direction: 'IN',
            amount: Math.abs(tx.amount),
            balance: tx.balance ?? null,
            description: tx.description ?? null,
            payerName: tx.payerName || '不明',
            payerNameNormalized: normalized,
            payerType: 'UNKNOWN',
            rawData: (tx.rawData as object) ?? undefined,
            matchStatus,
          },
        })

        if (matchStatus === 'AUTO_MATCHED' && match.bestMatch) {
          const ar = match.bestMatch.ar
          await tx2.paymentAllocation.create({
            data: {
              paymentTransactionId: payment.id,
              accountsReceivableId: ar.id,
              allocatedAmount: Math.abs(tx.amount),
            },
          })
          const newPaid = ar.paidAmount + Math.abs(tx.amount)
          const newStatus = deriveStatusFromPayment(ar.amount, newPaid, ar.status)
          await tx2.accountsReceivable.update({
            where: { id: ar.id },
            data: {
              paidAmount: newPaid,
              status: newStatus,
              paidAt: newStatus === 'PAID' ? new Date() : undefined,
            },
          })
          ar.paidAmount = newPaid
          ar.status = newStatus
        }
      })
      created++
    }

    return NextResponse.json({
      success: true,
      total: body.transactions.length,
      created,
      outCreated,
      inCreated: created - outCreated,
      skippedDup,
      autoMatched,
      needsReview,
      unmatched,
      errors,
    })
  } catch (error: unknown) {
    console.error('Payment JSON import error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
