/**
 * 既存の BillingRecord (GENERATED/SENT) から AR/Revenue を遡及生成する
 *
 * 使い方:
 *   cd /d/scripts/lts-sales-crm
 *   npx tsx scripts/backfill-receivables.ts
 */
import { PrismaClient } from '@prisma/client'
import { createReceivableWithRevenue } from '../src/lib/accounts-receivable'

const prisma = new PrismaClient()

async function main() {
  console.log('📊 既存 BillingRecord を確認中...')

  const records = await prisma.billingRecord.findMany({
    where: {
      status: { in: ['GENERATED', 'SENT', 'DOWNLOADED'] },
      amount: { not: null },
      AccountsReceivable: null, // まだAR未作成のもののみ
    },
    include: {
      Subscription: { include: { Contact: true } },
    },
    orderBy: { generatedAt: 'asc' },
  })

  console.log(`  対象件数: ${records.length}件`)

  if (records.length === 0) {
    console.log('✅ バックフィル対象なし')
    return
  }

  let created = 0
  let skipped = 0
  let errors = 0

  for (const r of records) {
    try {
      const [year, month] = r.billingMonth.split('-').map(Number)
      const invoicedAt = r.generatedAt ?? r.sentAt ?? new Date(year, month - 1, 5)

      const result = await createReceivableWithRevenue({
        contactId: r.Subscription.Contact.id,
        billingRecordId: r.id,
        source: 'SUBSCRIPTION',
        serviceName: r.Subscription.serviceName,
        invoiceSubject: r.Subscription.invoiceSubject,
        spreadsheetId: r.spreadsheetId,
        spreadsheetUrl: r.spreadsheetUrl,
        amount: r.amount!,
        invoicedAt,
      })

      if (result.skipped) {
        skipped++
      } else {
        created++
        console.log(`  ✅ ${r.Subscription.Contact.company || r.Subscription.Contact.name} / ${r.billingMonth} / ¥${r.amount!.toLocaleString()}`)
      }
    } catch (err) {
      errors++
      console.error(`  ❌ ${r.id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('')
  console.log('📈 結果:')
  console.log(`  新規作成: ${created}件`)
  console.log(`  スキップ: ${skipped}件`)
  console.log(`  エラー: ${errors}件`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
