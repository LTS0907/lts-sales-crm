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
  let rowIndex = -1
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][8] || '').trim().toLowerCase() === email.trim().toLowerCase()) {
      rowIndex = i + 1
      break
    }
  }
  if (rowIndex < 0) {
    return { matched: false, message: `${email} が ${TAB_NAME} に見つかりません` }
  }

  const requests = [
    {
      repeatCell: {
        range: {
          sheetId: TAB_GID,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        cell: { userEnteredFormat: { backgroundColor: LIGHT_GREEN } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    },
    {
      updateCells: {
        range: {
          sheetId: TAB_GID,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
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
    },
  ]

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  })

  return {
    matched: true,
    rowIndex,
    company: rows[rowIndex - 1][1],
    name: rows[rowIndex - 1][3],
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
  console.log(`[match] 行${result.rowIndex} (${result.company} / ${result.name})`)
  console.log(`[update] ${result.stamp}`)
}
