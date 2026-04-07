import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

/**
 * 請求日から支払期日を計算する
 * デフォルト: 月末締め翌月末払い
 * 例: 2026-04-15 → 2026-05-31
 *     2026-04-30 → 2026-05-31
 */
export function calcDefaultDueDate(invoicedAt: Date): Date {
  const d = new Date(invoicedAt)
  // 翌々月の0日 = 翌月末
  return new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59)
}

/**
 * 請求日から fiscalMonth ("2026-04" 形式) を生成
 */
export function toFiscalMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export interface CreateReceivableInput {
  contactId: string
  serviceName: string
  invoiceSubject?: string | null
  spreadsheetId?: string | null
  spreadsheetUrl?: string | null
  amount: number // 税込合計
  subtotal?: number // 税抜（省略時は amount / 1.1 で自動計算）
  taxAmount?: number // 消費税（省略時は amount - subtotal）
  invoicedAt: Date
  dueDate?: Date // 省略時は翌月末
  billingRecordId?: string | null
  source?: 'SUBSCRIPTION' | 'MANUAL'
  notes?: string | null
}

/**
 * 売掛金と売上を同時に作成する（発生主義）
 *
 * - prisma.$transaction でアトミック化（AR作成後のRevenue失敗で孤立を防止）
 * - billingRecordId 指定時は upsert で Idempotency 保証（同時リクエスト耐性）
 * - 単発（billingRecordId なし）は常に新規作成
 */
export async function createReceivableWithRevenue(
  input: CreateReceivableInput,
  externalTx?: Prisma.TransactionClient
) {
  // 金額計算（呼び出し側で先に計算しておく方が安全）
  const amount = input.amount
  const subtotal = input.subtotal ?? Math.floor(amount / 1.1)
  const taxAmount = input.taxAmount ?? amount - subtotal

  const invoicedAt = input.invoicedAt
  const dueDate = input.dueDate ?? calcDefaultDueDate(invoicedAt)
  const fiscalMonth = toFiscalMonth(invoicedAt)
  const source = input.source ?? (input.billingRecordId ? 'SUBSCRIPTION' : 'MANUAL')

  const arData = {
    contactId: input.contactId,
    billingRecordId: input.billingRecordId ?? null,
    source,
    serviceName: input.serviceName,
    invoiceSubject: input.invoiceSubject ?? null,
    spreadsheetId: input.spreadsheetId ?? null,
    spreadsheetUrl: input.spreadsheetUrl ?? null,
    subtotal,
    taxAmount,
    amount,
    invoicedAt,
    dueDate,
    status: 'OPEN' as const,
    notes: input.notes ?? null,
  }

  const revenueData = {
    contactId: input.contactId,
    serviceName: input.serviceName,
    subtotal,
    taxAmount,
    totalAmount: amount,
    recognizedAt: invoicedAt,
    fiscalMonth,
  }

  // トランザクション本体
  const work = async (tx: Prisma.TransactionClient) => {
    let ar
    let skipped = false

    if (input.billingRecordId) {
      // upsert で Idempotency を確保（同時実行耐性）
      const existing = await tx.accountsReceivable.findUnique({
        where: { billingRecordId: input.billingRecordId },
        include: { Revenue: true },
      })
      if (existing) {
        return { accountsReceivable: existing, revenue: existing.Revenue, skipped: true as const }
      }
      ar = await tx.accountsReceivable.create({ data: arData })
    } else {
      ar = await tx.accountsReceivable.create({ data: arData })
    }

    const revenue = await tx.revenue.create({
      data: { ...revenueData, accountsReceivableId: ar.id },
    })

    return { accountsReceivable: ar, revenue, skipped }
  }

  // 外部トランザクションが渡されていればそれを使い、なければ自分で開始
  if (externalTx) {
    return work(externalTx)
  }
  return prisma.$transaction(work)
}

/**
 * paidAmount に応じて status を判定する
 */
export function deriveStatusFromPayment(amount: number, paidAmount: number, currentStatus: string): string {
  if (paidAmount >= amount) return 'PAID'
  if (paidAmount > 0) return 'PARTIAL'
  // 未入金時は OPEN/OVERDUE/WRITTEN_OFF を維持
  if (['OVERDUE', 'WRITTEN_OFF'].includes(currentStatus)) return currentStatus
  return 'OPEN'
}

/**
 * 期日超過判定を行いstatusを更新（OPEN/PARTIAL を対象）
 * cronやページロード時に呼ぶ
 */
export async function refreshOverdueStatus() {
  const now = new Date()
  const result = await prisma.accountsReceivable.updateMany({
    where: {
      status: { in: ['OPEN', 'PARTIAL'] },
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  })
  return result.count
}
