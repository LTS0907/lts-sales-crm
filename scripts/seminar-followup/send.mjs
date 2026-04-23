/**
 * send.mjs — CRMの DRAFTED メールを Gmail API で送信し、SENT に更新
 *
 * 使い方:
 *   cd /Users/apple/scripts/lts-sales-crm
 *   node --env-file=.env scripts/seminar-followup/send.mjs <contactId>
 *
 * 認証:
 *   Service Account (DWD) で ryouchiku@ になりすまし送信
 *   /Users/apple/.config/gws/service-account.json
 *
 * 動作:
 *   1. contactId で Contact を取得
 *   2. emailStatus=DRAFTED であることを検証
 *   3. Gmail API で送信
 *   4. emailStatus=SENT / emailSentAt=now に更新
 *   5. FollowUpLog を追加 (touchNumber=現在+1, status=SENT)
 *   6. touchNumber をインクリメント
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import crypto from 'crypto'

const KEY_FILE = '/Users/apple/.config/gws/service-account.json'
const FROM_NAME = '龍竹一生'
const FROM_EMAIL = 'ryouchiku@life-time-support.com'

const prisma = new PrismaClient()

function encodeSubject(subject) {
  // RFC 2047 MIME encoded-word for UTF-8 subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

function buildMimeMessage({ to, from, fromName, subject, body }) {
  const headers = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ]
  return headers.join('\r\n') + '\r\n\r\n' + body
}

function base64url(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function main() {
  const contactId = process.argv[2]
  if (!contactId) {
    console.error('使い方: node send.mjs <contactId>')
    process.exit(1)
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) {
    console.error(`Contact not found: ${contactId}`)
    process.exit(1)
  }
  if (contact.emailStatus !== 'DRAFTED') {
    console.error(`emailStatus が DRAFTED ではありません: ${contact.emailStatus}`)
    console.error(`（誤送信防止のため中断）`)
    process.exit(1)
  }
  if (!contact.email) {
    console.error('Contact.email が未設定です')
    process.exit(1)
  }
  if (!contact.emailSubject || !contact.emailBody) {
    console.error('emailSubject または emailBody が空です')
    process.exit(1)
  }

  console.log(`[send] To: ${contact.email} / ${contact.name}`)
  console.log(`[send] Subject: ${contact.emailSubject}`)
  console.log(`[send] Body length: ${contact.emailBody.length} chars`)

  // Gmail API (Service Account + DWD)
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    clientOptions: { subject: FROM_EMAIL },
  })
  const client = await auth.getClient()
  const gmail = google.gmail({ version: 'v1', auth: client })

  const raw = buildMimeMessage({
    to: contact.email,
    from: FROM_EMAIL,
    fromName: FROM_NAME,
    subject: contact.emailSubject,
    body: contact.emailBody,
  })
  const encoded = base64url(raw)

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })

  console.log(`[send] 送信成功 / messageId=${res.data.id} / threadId=${res.data.threadId}`)

  // CRM 更新
  const now = new Date()
  const newTouch = (contact.touchNumber || 0) + 1

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      emailStatus: 'SENT',
      emailSentAt: now,
      touchNumber: newTouch,
      updatedAt: now,
    },
  })

  await prisma.followUpLog.create({
    data: {
      id: crypto.randomUUID(),
      contactId: contactId,
      touchNumber: newTouch,
      subject: contact.emailSubject,
      body: contact.emailBody,
      status: 'SENT',
      sentAt: now,
    },
  })

  console.log(`[db] emailStatus=SENT / emailSentAt=${now.toISOString()} / touchNumber=${newTouch}`)
  console.log(`[db] FollowUpLog を追加`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err?.message || err)
  if (err?.response?.data) console.error(JSON.stringify(err.response.data, null, 2))
  await prisma.$disconnect()
  process.exit(1)
})
