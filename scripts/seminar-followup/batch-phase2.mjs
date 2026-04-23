/**
 * batch-phase2.mjs — コメント有り × 要注意対象外 の一括処理
 *
 * 処理内容:
 *   [E] コメント有 + 有効メアド + CRMに未登録 → 軽引用テンプレ送信
 *
 * 使い方:
 *   cd /Users/apple/scripts/lts-sales-crm
 *   node --env-file=.env scripts/seminar-followup/batch-phase2.mjs [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import crypto from 'crypto'
import { renderLightTemplate } from './comment-light-template.mjs'
import { markSheetSent } from './mark-sheet-sent.mjs'

const KEY_FILE = '/Users/apple/.config/gws/service-account.json'
const FROM_NAME = '龍竹一生'
const FROM_EMAIL = 'ryouchiku@life-time-support.com'
const SHEET_ID = '1EDwF8Y2Fz5qxZpUD2adFxDAHa0ZzrvTKoWLYxP2jcqo'
const TAB_NAME = 'フォームの回答 1'

const DRY_RUN = process.argv.includes('--dry-run')
const DELAY_MS = 1500

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
function normEmail(raw) {
  return (raw || '').trim().split(/[=\s]/)[0]
}

// 役職語尾で department/title を分離
function splitDeptTitle(deptTitle) {
  const s = (deptTitle || '').trim()
  if (!s) return { department: '', title: '' }
  const titles = ['課長','部長','主任','代表取締役','代表','取締役','室長','マネージャー','係長','店長','次長','専務取締役','副店長','支店長代理','店長代理','部長代理','本部長','主査','チーフプランナー','コントローラー','SV','取締役部長','事業主','事業部長','専務','主事','顧問','社長']
  for (const t of titles.sort((a,b) => b.length - a.length)) {
    if (s.endsWith(t)) {
      const d = s.slice(0, s.length - t.length).trim().replace(/[、,　 ]+$/, '')
      return { department: d, title: t }
    }
  }
  return { department: s, title: '' }
}

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

  const seenEmail = new Set()
  const targets = []

  for (let i = 0; i < data.length; i++) {
    const r = data[i]
    const rowNum = i + 2
    if (!(r[1] || r[3])) continue
    const email = normEmail(r[8]).toLowerCase()
    const hasComment = (r[5] || '').trim().length > 0
    const alreadyStamped = (r[9] || '').trim().startsWith('送信済') || (r[9] || '').trim().startsWith('対応済')
    const hasValidEmail = email && email.includes('@')

    if (alreadyStamped) continue
    if (processedSet.has(email)) continue
    if (!hasValidEmail) continue
    if (!hasComment) continue
    if (seenEmail.has(email)) continue
    seenEmail.add(email)
    targets.push({ row: rowNum, data: r, email })
  }

  console.log(`\n📋 Phase 2 対象: ${targets.length}名 (コメント有 × 要注意対象外 × 未処理)`)
  if (DRY_RUN) console.log(`🌀 DRY RUN mode`)

  let ok = 0, fail = 0
  for (let idx = 0; idx < targets.length; idx++) {
    const v = targets[idx]
    const r = v.data
    const company = (r[1] || '').trim()
    const { department, title } = splitDeptTitle(r[2])
    const name = (r[3] || '').trim()
    const satisfaction = (r[4] || '').trim()
    const comment = (r[5] || '').trim()
    const training = (r[6] || '').trim()
    const support = (r[7] || '').trim()

    const { subject, body } = renderLightTemplate({
      company, department, title, name, comment,
      trainingInterest: training, supportInterest: support,
      satisfaction,
    })
    const memo = `4/17 リフォームAI活用講座ご参加。満足度:${satisfaction||'-'} / AI研修:${training||'-'} / AIサポート:${support||'-'}。コメント:「${comment}」 (Phase2 軽引用テンプレで初回送信、スプシ行${v.row})`

    const label = `[${idx+1}/${targets.length}] 行${v.row} ${company} / ${name}`
    try {
      if (!DRY_RUN) {
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
          },
        })
        await markSheetSent({ email: v.email, sentAt: now })
        console.log(`  ✅ ${label} (msgId=${sendRes.data.id})`)
      } else {
        console.log(`  🌀 ${label} [dry-run] / ${title || department || '(役職なし)'} / 満足度:${satisfaction}`)
      }
      ok++
    } catch (e) {
      console.log(`  ❌ ${label} → ${e.message}`)
      fail++
    }
    if (!DRY_RUN && idx < targets.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n========== 完了 ==========`)
  console.log(`  成功 ${ok} / 失敗 ${fail}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
