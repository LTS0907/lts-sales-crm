/**
 * batch-phase1.mjs — セミナーアンケート回答者の一括処理（Phase 1）
 *
 * 処理内容:
 *   [B] メアド無し       → CRM登録のみ (emailStatus=NO_EMAIL) + スプシに「対応済(メアド無)」マーク
 *   [C] コメント無+メアド有 → CRM登録 + 一括テンプレで送信 + スプシ緑マーク
 *   [D] コメント有        → スキップ (Phase 2 で個別対応)
 *   [A] 送信済            → スキップ
 *
 * 使い方:
 *   cd /Users/apple/scripts/lts-sales-crm
 *   node --env-file=.env scripts/seminar-followup/batch-phase1.mjs [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import crypto from 'crypto'
import { renderBulkEmail } from './bulk-template.mjs'
import { markSheetSent } from './mark-sheet-sent.mjs'

const KEY_FILE = '/Users/apple/.config/gws/service-account.json'
const FROM_NAME = '龍竹一生'
const FROM_EMAIL = 'ryouchiku@life-time-support.com'
const SHEET_ID = '1EDwF8Y2Fz5qxZpUD2adFxDAHa0ZzrvTKoWLYxP2jcqo'
const TAB_NAME = 'フォームの回答 1'
const TAB_GID = 160381548
const GREY = { red: 0.85, green: 0.85, blue: 0.85 } // 対応済(メアド無)用

const DRY_RUN = process.argv.includes('--dry-run')
const DELAY_MS = 1500 // Gmail送信間隔

const prisma = new PrismaClient()

function encodeHeader(value) {
  const isAscii = /^[\x00-\x7F]*$/.test(value)
  if (isAscii) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}
function buildMime({ to, fromName, from, subject, body }) {
  return [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ].join('\r\n') + '\r\n\r\n' + body
}
function b64url(s) {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const client = await auth.getClient()
  return google.sheets({ version: 'v4', auth: client })
}
async function getGmail() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    clientOptions: { subject: FROM_EMAIL },
  })
  const client = await auth.getClient()
  return google.gmail({ version: 'v1', auth: client })
}

function normEmail(raw) {
  return (raw || '').trim().split(/[=\s]/)[0]
}

async function markSheetNoEmail({ sheets, rowIndex }) {
  const stamp = `対応済(メアド無) ${new Date().toLocaleDateString('ja-JP')}`
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: TAB_GID,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 1,
              endColumnIndex: 2,
            },
            cell: { userEnteredFormat: { backgroundColor: GREY } },
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
                userEnteredFormat: { backgroundColor: GREY },
              }],
            }],
            fields: 'userEnteredValue,userEnteredFormat.backgroundColor',
          },
        },
      ],
    },
  })
}

async function main() {
  const sheets = await getSheets()
  const gmail = await getGmail()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A1:J250`,
  })
  const rows = res.data.values || []
  const data = rows.slice(1)

  const sentContacts = await prisma.contact.findMany({ select: { email: true } })
  const processedSet = new Set(sentContacts.map(s => (s.email || '').toLowerCase().trim()).filter(Boolean))

  // 分類
  const seenEmail = new Set()
  const noEmailList = []
  const noCommentList = []

  for (let i = 0; i < data.length; i++) {
    const r = data[i]
    const rowNum = i + 2
    const company = (r[1] || '').trim()
    if (!company && !(r[3] || '').trim()) continue
    const email = normEmail(r[8]).toLowerCase()
    const hasComment = (r[5] || '').trim().length > 0
    const alreadySent = (r[9] || '').trim().startsWith('送信済') || (r[9] || '').trim().startsWith('対応済')
    const hasValidEmail = email && email.includes('@')

    if (alreadySent) continue
    if (processedSet.has(email)) continue
    if (!hasValidEmail) {
      noEmailList.push({ row: rowNum, data: r })
      continue
    }
    if (seenEmail.has(email)) continue
    seenEmail.add(email)
    if (!hasComment) {
      noCommentList.push({ row: rowNum, data: r, email })
    }
  }

  console.log(`\n📋 バッチ対象`)
  console.log(`  [B] メアド無     : ${noEmailList.length}名`)
  console.log(`  [C] 一括送信対象 : ${noCommentList.length}名`)
  if (DRY_RUN) console.log(`  🌀 DRY RUN mode`)

  // ─────── [B] メアド無し処理 ───────
  console.log(`\n=== [B] メアド無し 登録のみ ===`)
  let bOk = 0, bFail = 0
  for (const v of noEmailList) {
    const r = v.data
    const company = (r[1] || '').trim() || '(社名未記入)'
    const name = (r[3] || '').trim() || '(氏名未記入)'
    const dept = (r[2] || '').trim()
    const comment = (r[5] || '').trim()
    // dept には役職含む混在の可能性があるが、そのまま保存
    const followNote = comment ? `\n【要フォロー: アンケートコメント】${comment}` : ''
    const memo = `4/17 リフォームAI活用講座ご参加。満足度:${r[4]||'-'} / AI研修:${r[6]||'-'} / AIサポート:${r[7]||'-'}。メアド未記入のため初回メール送信できず、CRM登録のみで完結扱い。（スプシ行${v.row}）${followNote}`
    const nextAction = comment ? '要フォロー（コメント有・メアド要確認）' : '対応済（メアド未記入）'
    const followUpStatus = comment ? 'NOT_SET' : 'NOT_APPLICABLE'
    try {
      if (!DRY_RUN) {
        await prisma.contact.create({
          data: {
            id: crypto.randomUUID(),
            updatedAt: new Date(),
            name,
            company,
            department: dept || null,
            title: null,
            email: null,
            episodeMemo: memo,
            connectionType: 'セミナー参加(2026/4/17 リフォームAI活用講座) / メアド未記入',
            emailStatus: 'NO_EMAIL',
            nextAction,
            owner: 'KAZUI',
            salesPhase: 'LEAD',
            followUpStatus,
          },
        })
        await markSheetNoEmail({ sheets, rowIndex: v.row })
      }
      console.log(`  ✅ 行${v.row} ${company} / ${name}`)
      bOk++
    } catch (e) {
      console.log(`  ❌ 行${v.row} ${company} / ${name} → ${e.message}`)
      bFail++
    }
  }

  // ─────── [C] 一括送信処理 ───────
  console.log(`\n=== [C] コメント無 一括送信 ===`)
  let cOk = 0, cFail = 0
  for (let idx = 0; idx < noCommentList.length; idx++) {
    const v = noCommentList[idx]
    const r = v.data
    const company = (r[1] || '').trim()
    const deptTitle = (r[2] || '').trim()
    const name = (r[3] || '').trim()
    const training = (r[6] || '').trim()
    const support = (r[7] || '').trim()

    // dept/title 推定 (役職語尾で分割)
    let department = deptTitle
    let title = ''
    const titleMatch = deptTitle.match(/^(.*?)(課長|部長|主任|代表取締役|代表|取締役|室長|マネージャー|課|係長|店長|次長|専務取締役|副店長|支店長代理|店長代理|部長代理|本部長|主査|チーフプランナー|コントローラー|SV|ASTER|CS推進部リフォーム埼玉店　店長|一般|事業主|無|なし)$/)
    if (titleMatch) {
      department = titleMatch[1].trim().replace(/[、, ]+$/, '')
      title = titleMatch[2]
    }

    const { subject, body } = renderBulkEmail({
      company, department, title, name,
      trainingInterest: training, supportInterest: support,
    })
    const memo = `4/17 リフォームAI活用講座ご参加。満足度:${r[4]||'-'} / AI研修:${training||'-'} / AIサポート:${support||'-'}。コメント無し、一括テンプレで初回送信。（スプシ行${v.row}）`

    const label = `[${idx+1}/${noCommentList.length}] 行${v.row} ${company} / ${name}`
    try {
      if (!DRY_RUN) {
        // CRM登録
        const existing = await prisma.contact.findFirst({ where: { email: v.email } })
        let contactId
        if (existing) {
          const upd = await prisma.contact.update({
            where: { id: existing.id },
            data: {
              updatedAt: new Date(),
              name, company: company || existing.company,
              title: title || existing.title,
              department: department || existing.department,
              episodeMemo: memo,
              connectionType: 'セミナー参加(2026/4/17 リフォームAI活用講座)',
              emailSubject: subject,
              emailBody: body,
              emailStatus: 'DRAFTED',
            },
          })
          contactId = upd.id
        } else {
          const c = await prisma.contact.create({
            data: {
              id: crypto.randomUUID(),
              updatedAt: new Date(),
              name,
              company: company || null,
              title: title || null,
              department: department || null,
              email: v.email,
              episodeMemo: memo,
              connectionType: 'セミナー参加(2026/4/17 リフォームAI活用講座)',
              emailSubject: subject,
              emailBody: body,
              emailStatus: 'DRAFTED',
              owner: 'KAZUI',
              salesPhase: 'LEAD',
            },
          })
          contactId = c.id
        }

        // 送信
        const raw = buildMime({ to: v.email, fromName: FROM_NAME, from: FROM_EMAIL, subject, body })
        const sendRes = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: b64url(raw) },
        })
        const now = new Date()
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            emailStatus: 'SENT',
            emailSentAt: now,
            touchNumber: { increment: 1 },
            updatedAt: now,
          },
        })
        await prisma.followUpLog.create({
          data: {
            id: crypto.randomUUID(),
            contactId,
            touchNumber: 1,
            subject, body,
            status: 'SENT',
            sentAt: now,
            gmailMessageId: sendRes.data.id,
            gmailThreadId: sendRes.data.threadId,
          },
        })
        // スプシ更新
        await markSheetSent({ email: v.email, sentAt: now })
        console.log(`  ✅ ${label} (msgId=${sendRes.data.id})`)
      } else {
        console.log(`  🌀 ${label} [dry-run]`)
      }
      cOk++
    } catch (e) {
      console.log(`  ❌ ${label} → ${e.message}`)
      cFail++
    }
    if (!DRY_RUN && idx < noCommentList.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n========== 完了 ==========`)
  console.log(`  [B] メアド無登録: 成功 ${bOk} / 失敗 ${bFail}`)
  console.log(`  [C] 一括送信   : 成功 ${cOk} / 失敗 ${cFail}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
