/**
 * マネーフォワード クラウド会計の CSV パーサー
 *
 * 対応想定フォーマット:
 *  1. 仕訳帳CSV (会計帳簿 → 仕訳帳)
 *     主な列: 取引日, 借方勘定科目, 借方金額, 貸方勘定科目, 貸方金額, 摘要, 取引先 等
 *  2. 補助元帳CSV (会計帳簿 → 補助元帳 / 勘定科目=普通預金・楽天銀行)
 *  3. 連携取引明細 (自動取引仕訳 → 楽天銀行の未仕訳CSV)
 *
 * すべて「楽天銀行への入金のみ」を抽出対象とする。
 * 判定基準:
 *  - 借方勘定科目が「普通預金」or 「預金」系
 *  - 借方補助科目/摘要に「楽天」を含む
 *  - 借方金額 > 0（入金）
 */
import { parse } from 'csv-parse/sync'

export interface ParsedTransaction {
  transactionDate: Date
  amount: number
  payerName: string
  rawRow: Record<string, string>
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  skipped: number
  format: 'journal' | 'ledger' | 'unknown'
  errors: string[]
}

/**
 * Shift_JIS または UTF-8 の CSV バイナリをテキスト化
 * BOM 検出 + 文字コード自動判定
 */
export function decodeCsvBuffer(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3))
  }
  // Try UTF-8 first; if it has replacement chars, fall back to Shift_JIS
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (!utf8.includes('\ufffd')) return utf8
  try {
    return new TextDecoder('shift_jis').decode(bytes)
  } catch {
    return utf8
  }
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const trimmed = s.trim().replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-')
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d
}

function parseAmount(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(/[,¥円\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  const n = parseInt(cleaned)
  return isNaN(n) ? 0 : n
}

function isBankDepositAccount(debitAccount: string, debitSub: string, description: string): boolean {
  // 勘定科目が「普通預金」または「当座預金」
  const acct = (debitAccount || '').trim()
  if (!acct) return false
  if (!['普通預金', '当座預金', '預金'].some(k => acct.includes(k))) return false
  // 補助科目 or 摘要に「楽天」を含む
  const sub = (debitSub || '').trim()
  const desc = (description || '').trim()
  return sub.includes('楽天') || desc.includes('楽天') || sub.includes('Rakuten') || desc.includes('Rakuten')
}

/**
 * 仕訳帳CSV または補助元帳CSV をパース
 *
 * 柔軟な列名検出で、以下のパターンを許容:
 *  - 「取引日」「日付」
 *  - 「借方勘定科目」「借方科目」
 *  - 「借方補助科目」「借方補助」
 *  - 「借方金額」「金額」（単列の場合は借方と判断）
 *  - 「摘要」「適用」「メモ」「内容」
 *  - 「取引先」「貸方取引先」「借方取引先」
 */
export function parseMfCsv(csvText: string): ParseResult {
  const errors: string[] = []
  let records: Record<string, string>[] = []
  try {
    records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as Record<string, string>[]
  } catch (e) {
    errors.push(`CSVパースエラー: ${e instanceof Error ? e.message : String(e)}`)
    return { transactions: [], skipped: 0, format: 'unknown', errors }
  }

  if (records.length === 0) {
    return { transactions: [], skipped: 0, format: 'unknown', errors: ['レコードがありません'] }
  }

  // 列名検出
  const headers = Object.keys(records[0])
  const findCol = (patterns: RegExp[]): string | null => {
    for (const p of patterns) {
      const hit = headers.find(h => p.test(h))
      if (hit) return hit
    }
    return null
  }

  const dateCol = findCol([/取引日/, /^日付/, /計上日/])
  const debitAcctCol = findCol([/借方.*勘定/, /借方科目/])
  const debitSubCol = findCol([/借方.*補助/])
  const debitAmountCol = findCol([/借方.*金額/, /^入金/, /^入金額/])
  const creditAmountCol = findCol([/貸方.*金額/, /^出金/, /^出金額/])
  const descCol = findCol([/摘要/, /適用/, /内容/, /メモ/])
  const partnerCol = findCol([/貸方.*取引先/, /借方.*取引先/, /^取引先/])
  // 単純な入出金明細の場合
  const simpleAmountCol = findCol([/^金額$/])
  const simpleInOutCol = findCol([/^区分$/, /^入出金/])

  // フォーマット推定
  let format: ParseResult['format'] = 'unknown'
  if (debitAcctCol && (debitAmountCol || descCol)) format = 'journal'
  else if (simpleAmountCol && (simpleInOutCol || descCol)) format = 'ledger'

  const transactions: ParsedTransaction[] = []
  let skipped = 0

  for (const row of records) {
    const dateRaw = dateCol ? row[dateCol] : ''
    const date = parseDate(dateRaw)
    if (!date) { skipped++; continue }

    let amount = 0
    let isDeposit = false
    let payerName = ''

    if (format === 'journal') {
      const debitAcct = debitAcctCol ? row[debitAcctCol] : ''
      const debitSub = debitSubCol ? row[debitSubCol] : ''
      const desc = descCol ? row[descCol] : ''
      const debitAmount = debitAmountCol ? parseAmount(row[debitAmountCol]) : 0
      const creditAmount = creditAmountCol ? parseAmount(row[creditAmountCol]) : 0

      // 楽天銀行の入金（借方が普通預金、かつ借方金額 > 0）
      if (isBankDepositAccount(debitAcct, debitSub, desc) && debitAmount > 0) {
        isDeposit = true
        amount = debitAmount
        // 名前抽出優先: 取引先列 > 摘要
        payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
      }
      void creditAmount // eslint
    } else if (format === 'ledger') {
      const amtRaw = simpleAmountCol ? row[simpleAmountCol] : ''
      const inOut = simpleInOutCol ? row[simpleInOutCol] : ''
      const desc = descCol ? row[descCol] : ''
      const amt = parseAmount(amtRaw)
      if (/入金|入/.test(inOut) && amt > 0) {
        isDeposit = true
        amount = amt
        payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
      }
    }

    if (!isDeposit) { skipped++; continue }
    if (amount <= 0) { skipped++; continue }
    payerName = (payerName || '').trim().slice(0, 200)
    if (!payerName) payerName = '不明'

    transactions.push({
      transactionDate: date,
      amount,
      payerName,
      rawRow: row,
    })
  }

  return { transactions, skipped, format, errors }
}

/**
 * 摘要から送金者名を抽出する
 * 例: "振込 リバテイホ-ム(カ" → "リバテイホ-ム(カ"
 *     "普通振込 カ）ナガサク" → "カ）ナガサク"
 */
function extractPayerFromDescription(desc: string): string {
  if (!desc) return ''
  let s = desc.trim()
  // 先頭の「振込」「普通振込」「自動振込」「ATM振込」等を除去
  s = s.replace(/^(ATM振込|普通振込|自動振込|振込|入金|振替)\s*/, '')
  return s
}
