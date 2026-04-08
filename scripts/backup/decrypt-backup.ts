/**
 * バックアップダンプの復号・復元スクリプト
 *
 * 使い方:
 *   1. GitHub の lts-sales-crm-backup から dumps/YYYY-MM-DD.enc をダウンロード
 *   2. BACKUP_ENCRYPTION_PASSWORD 環境変数を設定（Vercel env からコピー）
 *   3. npx tsx scripts/backup/decrypt-backup.ts <enc-file> [--write]
 *
 *      --write なしで復号内容を表示のみ
 *      --write でDBに復元（既存データを上書き！注意）
 */
import { readFileSync } from 'fs'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

function decrypt(payload: string, password: string): string {
  const parts = payload.split(':')
  if (parts.length !== 5 || parts[0] !== 'AES-256-GCM') {
    throw new Error('Invalid encrypted payload format')
  }
  const [, saltB64, ivB64, tagB64, dataB64] = parts
  const salt = Buffer.from(saltB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const key = crypto.scryptSync(password, salt, 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}

async function main() {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  const shouldWrite = args.includes('--write')

  if (!file) {
    console.error('Usage: npx tsx scripts/backup/decrypt-backup.ts <file.enc> [--write]')
    process.exit(1)
  }

  const password = process.env.BACKUP_ENCRYPTION_PASSWORD
  if (!password) {
    console.error('Error: BACKUP_ENCRYPTION_PASSWORD env var is required')
    process.exit(1)
  }

  const encrypted = readFileSync(file, 'utf8').trim()
  const json = decrypt(encrypted, password)
  const data = JSON.parse(json)

  console.log('📦 バックアップ内容:')
  for (const [table, rows] of Object.entries(data)) {
    console.log(`  ${table}: ${(rows as unknown[]).length}件`)
  }

  if (!shouldWrite) {
    console.log('\n復号のみ完了。--write 付きで実行するとDBに復元します（既存データ上書き注意）')
    return
  }

  // DB 復元
  console.log('\n⚠️  DBに復元します...')
  const prisma = new PrismaClient()
  try {
    // 依存関係順に削除→復元
    await prisma.paymentAllocation.deleteMany()
    await prisma.paymentTransaction.deleteMany()
    await prisma.revenue.deleteMany()
    await prisma.accountsReceivable.deleteMany()
    await prisma.billingRecord.deleteMany()
    await prisma.subscription.deleteMany()
    await prisma.contract.deleteMany()
    await prisma.taskLink.deleteMany()
    await prisma.followUpLog.deleteMany()
    await prisma.meetingParticipant.deleteMany()
    await prisma.meeting.deleteMany()
    await prisma.groupMember.deleteMany()
    await prisma.group.deleteMany()
    await prisma.servicePhase.deleteMany()
    await prisma.exchange.deleteMany()
    await prisma.note.deleteMany()
    await prisma.contact.deleteMany()

    // 復元順（FK 依存解消順）
    const order = [
      'Contact', 'Note', 'Exchange', 'Group', 'GroupMember',
      'Meeting', 'MeetingParticipant', 'ServicePhase', 'Contract',
      'Subscription', 'BillingRecord', 'AccountsReceivable', 'Revenue',
      'PaymentTransaction', 'PaymentAllocation',
      'FollowUpLog', 'TaskLink', 'BackupLog',
    ]
    for (const name of order) {
      const rows = data[name] || []
      if (rows.length === 0) continue
      const model = (prisma as unknown as Record<string, { createMany: (args: unknown) => Promise<unknown> }>)[name.charAt(0).toLowerCase() + name.slice(1)]
      await model.createMany({ data: rows, skipDuplicates: true })
      console.log(`  ✅ ${name}: ${rows.length}件`)
    }
    console.log('\n✅ 復元完了')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
