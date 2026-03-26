/* ************************************************************************** */
/*                                                                            */
/*    import-csv.mjs                                    :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
/**
 * Googleスプレッドシート (CSV) を combined-crm の SQLite DB にインポートするスクリプト
 * 使い方: node scripts/import-csv.mjs <csvファイルパス>
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import { parse } from 'csv-parse/sync'

const prisma = new PrismaClient()

function parseDate(str) {
  if (!str || str.trim() === '') return null
  // 2026/1/21 or 2026-01-15 形式
  const normalized = str.trim().replace(/\//g, '-')
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d
}

function mapEmailStatus(csvStatus) {
  if (!csvStatus) return 'UNSENT'
  const s = csvStatus.trim()
  if (s === '送信済み') return 'SENT'
  if (s === '承認待ち') return 'PENDING'
  if (s === '下書き') return 'DRAFTED'
  return 'UNSENT'
}

function mapSalesPhase(csvPhase) {
  if (!csvPhase || csvPhase.startsWith('http')) return 'LEAD'
  const p = csvPhase.trim()
  const phaseMap = {
    'LEAD': 'LEAD',
    'リード': 'LEAD',
    'APPROACH': 'APPROACH',
    'アプローチ': 'APPROACH',
    'PROPOSAL': 'PROPOSAL',
    '提案': 'PROPOSAL',
    'NEGOTIATION': 'NEGOTIATION',
    '交渉': 'NEGOTIATION',
    'CONTRACT': 'CONTRACT',
    '契約': 'CONTRACT',
    'FOLLOWUP': 'FOLLOWUP',
    'フォロー': 'FOLLOWUP',
    'LONG_TERM': 'LONG_TERM',
    '長期': 'LONG_TERM',
  }
  return phaseMap[p] || 'LEAD'
}

async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: node scripts/import-csv.mjs <csvファイルパス>')
    process.exit(1)
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  })

  console.log(`📋 ${records.length} 件を読み込みます...`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const row of records) {
    const name = (row['氏名'] || '').trim()
    if (!name) {
      skipped++
      continue
    }

    // 電話番号: 携帯優先
    const phone = (row['携帯電話番号'] || row['会社電話番号'] || '').trim()

    // 住所: 郵便番号 + 住所
    const postalCode = (row['郵便番号'] || '').trim()
    const addressBody = (row['住所'] || '').trim()
    const address = postalCode && addressBody
      ? `〒${postalCode.replace(/^〒/, '')} ${addressBody}`
      : (addressBody || postalCode || null)

    // emailStatus
    const emailStatus = mapEmailStatus(row['メール送信ステータス'])

    // emailSentAt
    const emailSentAt = parseDate(row['初回送信日'])

    // followUpDate
    const followUpDate = parseDate(row['次回フォロー予定日'])

    // salesPhase
    const salesPhase = mapSalesPhase(row['営業フェーズ'])

    // touchNumber
    const touchRaw = (row['タッチ番号'] || '').trim()
    const touchNumber = touchRaw && !isNaN(parseInt(touchRaw, 10))
      ? parseInt(touchRaw, 10)
      : 0

    // nextAction
    const nextActionRaw = (row['次のアクション'] || '').trim()
    const nextAction = nextActionRaw && !nextActionRaw.startsWith('http') ? nextActionRaw : null

    // followUpText
    const followUpTextRaw = (row['次回フォロー文'] || '').trim()
    const followUpText = followUpTextRaw && !followUpTextRaw.startsWith('http') ? followUpTextRaw : null

    // followUpStatus
    const followUpStatusRaw = (row['次回フォローステータス'] || '').trim()
    const followUpStatus = followUpStatusRaw || 'NOT_SET'

    // emailBody: only if not just a URL placeholder
    const emailBodyRaw = (row['メール本文（下書き）'] || '').trim()
    const emailBody = emailBodyRaw || null

    const emailSubjectRaw = (row['メール件名'] || '').trim()
    const emailSubject = emailSubjectRaw || null

    try {
      await prisma.contact.create({
        data: {
          name,
          company: (row['会社名'] || '').trim() || null,
          department: (row['部署'] || '').trim() || null,
          title: (row['役職'] || '').trim() || null,
          email: (row['メールアドレス'] || '').trim() || null,
          phone: phone || null,
          website: (row['ホームページURL'] || '').trim() || null,
          address: address || null,
          episodeMemo: (row['出会いやコメント'] || '').trim() || null,
          recommendedServices: (row['推奨サービス'] || '').trim() || null,
          serviceReason: (row['推奨理由'] || '').trim() || null,
          emailSubject,
          emailBody,
          emailStatus,
          emailSentAt,
          followUpText,
          followUpStatus,
          followUpDate,
          salesPhase,
          nextAction,
          touchNumber,
        },
      })
      created++
      if (created % 50 === 0) console.log(`  ${created} 件完了...`)
    } catch (e) {
      console.error(`  ❌ エラー [${name}]: ${e.message}`)
      errors++
    }
  }

  console.log(`\n✅ インポート完了`)
  console.log(`  作成: ${created} 件`)
  console.log(`  スキップ（氏名なし）: ${skipped} 件`)
  console.log(`  エラー: ${errors} 件`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
