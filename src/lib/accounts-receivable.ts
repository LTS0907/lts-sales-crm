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
 * 既に billingRecordId が紐づいているARが存在する場合はスキップ
 */
export async function createReceivableWithRevenue(
  input: CreateReceivableInput,
  tx?: Prisma.TransactionClient
) {
  const db = tx || prisma

  // Idempotency: billingRecordIdが指定されていて既存ARがあればスキップ
  if (input.billingRecordId) {
    const existing = await db.accountsReceivable.findUnique({
      where: { billingRecordId: input.billingRecordId },
    })
    if (existing) return { accountsReceivable: existing, revenue: null, skipped: true as const }
  }

  // 金額計算
  const amount = input.amount
  const subtotal = input.subtotal ?? Math.floor(amount / 1.1)
  const taxAmount = input.taxAmount ?? amount - subtotal

  const invoicedAt = input.invoicedAt
  const dueDate = input.dueDate ?? calcDefaultDueDate(invoicedAt)
  const fiscalMonth = toFiscalMonth(invoicedAt)

  const ar = await db.accountsReceivable.create({
    data: {
      contactId: input.contactId,
      billingRecordId: input.billingRecordId ?? null,
      source: input.source ?? (input.billingRecordId ? 'SUBSCRIPTION' : 'MANUAL'),
      serviceName: input.serviceName,
      invoiceSubject: input.invoiceSubject ?? null,
      spreadsheetId: input.spreadsheetId ?? null,
      spreadsheetUrl: input.spreadsheetUrl ?? null,
      subtotal,
      taxAmount,
      amount,
      invoicedAt,
      dueDate,
      status: 'OPEN',
      notes: input.notes ?? null,
    },
  })

  // 発生主義：請求日 = 売上計上日
  const revenue = await db.revenue.create({
    data: {
      accountsReceivableId: ar.id,
      contactId: input.contactId,
      serviceName: input.serviceName,
      subtotal,
      taxAmount,
      totalAmount: amount,
      recognizedAt: invoicedAt,
      fiscalMonth,
    },
  })

  return { accountsReceivable: ar, revenue, skipped: false as const }
}

/**
 * 期日超過判定を行いstatusを更新（OPENのみ対象）
 * cronやページロード時に呼ぶ
 */
export async function refreshOverdueStatus() {
  const now = new Date()
  const result = await prisma.accountsReceivable.updateMany({
    where: {
      status: 'OPEN',
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  })
  return result.count
}
