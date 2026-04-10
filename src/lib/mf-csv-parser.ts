/**
 * マネーフォワード クラウド会計の CSV パーサー
 *
 * 対応想定フォーマット:
 *  1. 仕訳帳CSV (会計帳簿 → 仕訳帳)
 *     主な列: 取引日, 借方勘定科目, 借方金額, 貸方勘定科目, 貸方金額, 摘要, 取引先 等
 *  2. 補助元帳CSV (会計帳簿 → 補助元帳 / 勘定科目=普通預金・楽天銀行)
 *  3. 連携取引明細 (自動取引仕訳 → 楽天銀行の未仕訳CSV)
 *
 * 楽天銀行の入金（IN）と出金（OUT）を両方抽出し、残高列があれば取得する。
 * 判定基準:
 *  - 借方勘定科目が「普通預金」or 「預金」系 + 「楽天」含む → IN
 *  - 貸方勘定科目が「普通預金」or 「預金」系 + 「楽天」含む → OUT
 *  - または簡易明細の入出金区分
 */
import { parse } from 'csv-parse/sync'

export interface ParsedTransaction {
  transactionDate: Date
  direction: 'IN' | 'OUT'
  amount: number          // 常に正の値
  balance: number | null  // 取引後残高（わかれば）
  payerName: string       // 相手方名義
  description: string     // 摘要全文
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
 */
export function decodeCsvBuffer(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3))
  }
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

function isRakutenDepositAccount(account: string, sub: string, description: string): boolean {
  const acct = (account || '').trim()
  if (!acct) return false
  if (!['普通預金', '当座預金', '預金'].some(k => acct.includes(k))) return false
  const s = (sub || '').trim()
  const desc = (description || '').trim()
  return s.includes('楽天') || desc.includes('楽天') || s.includes('Rakuten') || desc.includes('Rakuten')
}

/**
 * 仕訳帳 / 補助元帳 / 入出金明細 CSV をパースする
 * 入金/出金/残高すべて抽出
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
  const debitAmountCol = findCol([/借方.*金額/])
  const creditAcctCol = findCol([/貸方.*勘定/, /貸方科目/])
  const creditSubCol = findCol([/貸方.*補助/])
  const creditAmountCol = findCol([/貸方.*金額/])
  const descCol = findCol([/摘要/, /適用/, /内容/, /メモ/])
  const partnerCol = findCol([/貸方.*取引先/, /借方.*取引先/, /^取引先/])
  const balanceCol = findCol([/^残高/, /差引残高/, /取引後残高/])
  // 簡易明細
  const simpleDepositCol = findCol([/^入金/, /^入金額/])
  const simpleWithdrawCol = findCol([/^出金/, /^出金額/])
  const simpleAmountCol = findCol([/^金額$/])
  const simpleInOutCol = findCol([/^区分$/, /^入出金/])

  let format: ParseResult['format'] = 'unknown'
  if (debitAcctCol && (debitAmountCol || creditAmountCol)) format = 'journal'
  else if ((simpleDepositCol || simpleWithdrawCol || simpleAmountCol) && descCol) format = 'ledger'

  const transactions: ParsedTransaction[] = []
  let skipped = 0

  for (const row of records) {
    const dateRaw = dateCol ? row[dateCol] : ''
    const date = parseDate(dateRaw)
    if (!date) { skipped++; continue }

    const desc = descCol ? (row[descCol] || '') : ''
    const balance = balanceCol ? (parseAmount(row[balanceCol]) || null) : null

    let direction: 'IN' | 'OUT' | null = null
    let amount = 0
    let payerName = ''

    if (format === 'journal') {
      const debitAcct = debitAcctCol ? row[debitAcctCol] : ''
      const debitSub = debitSubCol ? row[debitSubCol] : ''
      const debitAmount = debitAmountCol ? parseAmount(row[debitAmountCol]) : 0
      const creditAcct = creditAcctCol ? row[creditAcctCol] : ''
      const creditSub = creditSubCol ? row[creditSubCol] : ''
      const creditAmount = creditAmountCol ? parseAmount(row[creditAmountCol]) : 0

      // 楽天銀行が借方（入金）
      if (isRakutenDepositAccount(debitAcct, debitSub, desc) && debitAmount > 0) {
        direction = 'IN'
        amount = debitAmount
        payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
      }
      // 楽天銀行が貸方（出金）
      else if (isRakutenDepositAccount(creditAcct, creditSub, desc) && creditAmount > 0) {
        direction = 'OUT'
        amount = creditAmount
        payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
      }
    } else if (format === 'ledger') {
      // 入金列・出金列が別々の場合
      if (simpleDepositCol) {
        const dep = parseAmount(row[simpleDepositCol])
        if (dep > 0) {
          direction = 'IN'
          amount = dep
          payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
        }
      }
      if (!direction && simpleWithdrawCol) {
        const wd = parseAmount(row[simpleWithdrawCol])
        if (wd > 0) {
          direction = 'OUT'
          amount = wd
          payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
        }
      }
      // 金額+区分
      if (!direction && simpleAmountCol) {
        const amt = parseAmount(row[simpleAmountCol])
        const inOut = simpleInOutCol ? row[simpleInOutCol] : ''
        if (amt > 0) {
          if (/入金|入/.test(inOut)) direction = 'IN'
          else if (/出金|出/.test(inOut)) direction = 'OUT'
          else direction = amt > 0 ? 'IN' : 'OUT'
          amount = Math.abs(amt)
          payerName = (partnerCol && row[partnerCol]) || extractPayerFromDescription(desc) || desc
        }
      }
    }

    if (!direction || amount <= 0) { skipped++; continue }
    payerName = (payerName || '').trim().slice(0, 200) || '不明'

    transactions.push({
      transactionDate: date,
      direction,
      amount,
      balance,
      payerName,
      description: (desc || '').slice(0, 500),
      rawRow: row,
    })
  }

  return { transactions, skipped, format, errors }
}

function extractPayerFromDescription(desc: string): string {
  if (!desc) return ''
  let s = desc.trim()
  s = s.replace(/^(ATM振込|普通振込|自動振込|振込|入金|振替)\s*/, '')
  return s
}
