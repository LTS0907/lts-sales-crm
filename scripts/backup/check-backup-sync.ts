/**
 * バックアップ同期チェックスクリプト
 *
 * Prisma schema のモデル一覧と src/lib/backup.ts の dumpAllTables() の
 * 対応関係をチェックし、ズレがあれば警告する。
 *
 * 使い方:
 *   npx tsx scripts/backup/check-backup-sync.ts
 *
 * pre-commit hook や PR チェックで使える。
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const SCHEMA = resolve(ROOT, 'prisma/schema.prisma')
const BACKUP = resolve(ROOT, 'src/lib/backup.ts')
const DECRYPT = resolve(ROOT, 'scripts/backup/decrypt-backup.ts')

// Prisma schema からモデル名を抽出
function extractPrismaModels(): string[] {
  const content = readFileSync(SCHEMA, 'utf8')
  const re = /^model\s+(\w+)\s*\{/gm
  const models: string[] = []
  let m
  while ((m = re.exec(content)) !== null) {
    models.push(m[1])
  }
  return models.sort()
}

// backup.ts の dumpAllTables() から返り値オブジェクトのキーを抽出
function extractBackupTables(): string[] {
  const content = readFileSync(BACKUP, 'utf8')
  // return { X: ..., Y: ..., } のオブジェクト部分
  const match = content.match(/return\s*\{([\s\S]+?)\}/)
  if (!match) return []
  const keys: string[] = []
  const keyRe = /^\s*(\w+):/gm
  let m
  while ((m = keyRe.exec(match[1])) !== null) {
    keys.push(m[1])
  }
  return keys.sort()
}

// decrypt-backup.ts の order 配列からテーブル名を抽出
function extractDecryptOrder(): string[] {
  const content = readFileSync(DECRYPT, 'utf8')
  const match = content.match(/const\s+order\s*=\s*\[([\s\S]+?)\]/)
  if (!match) return []
  const names: string[] = []
  const nameRe = /['"](\w+)['"]/g
  let m
  while ((m = nameRe.exec(match[1])) !== null) {
    names.push(m[1])
  }
  return names.sort()
}

function main() {
  const prismaModels = extractPrismaModels()
  const backupTables = extractBackupTables()
  const decryptTables = extractDecryptOrder()

  console.log(`📊 Prisma モデル: ${prismaModels.length}件`)
  console.log(`📦 backup.ts dumpAllTables(): ${backupTables.length}件`)
  console.log(`♻️  decrypt-backup.ts order: ${decryptTables.length}件`)

  const missingInBackup = prismaModels.filter(m => !backupTables.includes(m))
  const missingInDecrypt = prismaModels.filter(m => !decryptTables.includes(m))
  const extraInBackup = backupTables.filter(t => !prismaModels.includes(t))
  const extraInDecrypt = decryptTables.filter(t => !prismaModels.includes(t))

  let hasError = false

  if (missingInBackup.length > 0) {
    hasError = true
    console.log('\n❌ backup.ts に抜けているテーブル:')
    missingInBackup.forEach(m => console.log(`   - ${m}`))
    console.log('\n   対応: src/lib/backup.ts の dumpAllTables() に追加してください')
  }

  if (missingInDecrypt.length > 0) {
    hasError = true
    console.log('\n❌ decrypt-backup.ts の order 配列に抜けているテーブル:')
    missingInDecrypt.forEach(m => console.log(`   - ${m}`))
    console.log('\n   対応: scripts/backup/decrypt-backup.ts の order 配列に追加してください')
  }

  if (extraInBackup.length > 0) {
    console.log('\n⚠️  backup.ts にあるが Prisma に無いテーブル:')
    extraInBackup.forEach(t => console.log(`   - ${t}`))
  }

  if (extraInDecrypt.length > 0) {
    console.log('\n⚠️  decrypt-backup.ts の order にあるが Prisma に無いテーブル:')
    extraInDecrypt.forEach(t => console.log(`   - ${t}`))
  }

  if (!hasError) {
    console.log('\n✅ バックアップ対象テーブルは Prisma schema と同期しています')
    console.log('\n📌 忘れずに確認：')
    console.log('   1. Google Sheets バックアップ先スプシに該当シートがあるか')
    console.log('      https://docs.google.com/spreadsheets/d/1XozVEvNAEl4kTJCJsu4OqfKNKpv3bloIjrWvn3XJEZI/edit')
    console.log('   2. 本番で /api/backup/run を実行して errors=[] であること')
  } else {
    console.log('\n❌ バックアップ同期エラーがあります。修正してください。')
    process.exit(1)
  }
}

main()
