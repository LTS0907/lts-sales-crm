/**
 * mark-sheet-sent.mjs — セミナーアンケートスプシの「送信済み」行を視覚化
 *
 * スタンドアロン使用:
 *   node scripts/seminar-followup/mark-sheet-sent.mjs <email> [<ISO-date>]
 *
 * モジュール利用:
 *   import { markSheetSent } from './mark-sheet-sent.mjs'
 *   await markSheetSent({ email, sentAt })
 *
 * 動作:
 *   1. 'フォームの回答 1' シート (gid=160381548) の I列 からメアドで行を検索
 *   2. 該当行の B列（貴社名）の背景を明るい緑 (#b7e1cd) に変更
 *   3. J列に「送信済 YYYY-MM-DD HH:mm」を記入（背景も緑）
 *
 * 認証:
 *   Service Account (/Users/apple/.config/gws/service-account.json)
 *   スプシは SA に編集権限共有済み
 */
import { google } from 'googleapis'

const KEY_FILE = '/Users/apple/.config/gws/service-account.json'
const SHEET_ID = '1EDwF8Y2Fz5qxZpUD2adFxDAHa0ZzrvTKoWLYxP2jcqo'
const TAB_NAME = 'フォームの回答 1'
const TAB_GID = 160381548
const LIGHT_GREEN = { red: 0.718, green: 0.882, blue: 0.804 } // #b7e1cd

function formatStamp(sentDate) {
  const d = new Date(sentDate)
  const pad = (n) => String(n).padStart(2, '0')
  return `送信済 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export async function markSheetSent({ email, sentAt }) {
  if (!email) throw new Error('email は必須です')
  const sentDate = sentAt ? new Date(sentAt) : new Date()
  const stamp = formatStamp(sentDate)

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A1:I250`,
  })
  const rows = read.data.values || []
  const matched = []
  for (let i = 1; i < rows.length; i++) {
    // 正規化: "ooba@smile-reform.com=XLOOKUP(...)" のような式混入を除去
    const raw = (rows[i][8] || '').trim()
    const normalized = raw.split(/[=\s]/)[0].toLowerCase()
    if (normalized === email.trim().toLowerCase()) {
      matched.push({
        rowIndex: i + 1,
        company: rows[i][1],
        name: rows[i][3],
      })
    }
  }
  if (matched.length === 0) {
    return { matched: false, message: `${email} が ${TAB_NAME} に見つかりません` }
  }

  const requests = []
  for (const m of matched) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: TAB_GID,
          startRowIndex: m.rowIndex - 1,
          endRowIndex: m.rowIndex,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        cell: { userEnteredFormat: { backgroundColor: LIGHT_GREEN } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    })
    requests.push({
      updateCells: {
        range: {
          sheetId: TAB_GID,
          startRowIndex: m.rowIndex - 1,
          endRowIndex: m.rowIndex,
          startColumnIndex: 9,
          endColumnIndex: 10,
        },
        rows: [{
          values: [{
            userEnteredValue: { stringValue: stamp },
            userEnteredFormat: { backgroundColor: LIGHT_GREEN },
          }],
        }],
        fields: 'userEnteredValue,userEnteredFormat.backgroundColor',
      },
    })
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  })

  return {
    matched: true,
    rows: matched,
    stamp,
  }
}

// CLI 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.argv[2]
  const sentAt = process.argv[3]
  if (!email) {
    console.error('使い方: node mark-sheet-sent.mjs <email> [<ISO-date>]')
    process.exit(1)
  }
  const result = await markSheetSent({ email, sentAt })
  if (!result.matched) {
    console.error(result.message)
    process.exit(1)
  }
  for (const r of result.rows) {
    console.log(`[match] 行${r.rowIndex} (${r.company} / ${r.name})`)
  }
  console.log(`[update] ${result.stamp}`)
}
