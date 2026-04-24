/**
 * POST /api/support/send
 *
 * CRM 画面内「サポートに連絡」フォームからの問い合わせを
 * 龍竹・樺嶋の Google Chat DM に cs@ から送信する。
 *
 * 実装は lts-staff-hub の /api/support と同等。
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import { sendChatDM } from '@/lib/chat-sender'

const SENDER_EMAIL = 'cs@life-time-support.com'
const RECIPIENTS = [
  'ryouchiku@life-time-support.com',
  'r.kabashima@life-time-support.com',
]

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10MB

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const text = String(formData.get('text') ?? '').trim()
  const pageUrl = String(formData.get('pageUrl') ?? '').trim()
  const screenshot = formData.get('screenshot')

  if (!text) {
    return NextResponse.json({ error: '本文を入力してください' }, { status: 400 })
  }

  let attachment: { filename: string; contentType: string; data: Buffer } | undefined
  if (screenshot && screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: 'スクリーンショットは10MB以下にしてください' },
        { status: 413 }
      )
    }
    const buf = Buffer.from(await screenshot.arrayBuffer())
    const safeName =
      screenshot.name && /\.[a-z0-9]+$/i.test(screenshot.name)
        ? screenshot.name
        : `screenshot-${Date.now()}.png`
    attachment = {
      filename: safeName,
      contentType: screenshot.type || 'image/png',
      data: buf,
    }
  }

  const senderName = session.user.name ?? '(名前不明)'
  const senderEmail = session.user.email
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  const messageText = [
    '📩 *Sales CRM サポート問い合わせ*',
    '',
    `👤 差出人: ${senderName} (${senderEmail})`,
    `🕒 送信日時: ${now}`,
    pageUrl ? `🔗 ページ: ${pageUrl}` : null,
    '',
    '—— 本文 ——',
    text,
  ]
    .filter(l => l !== null)
    .join('\n')

  const results = await Promise.all(
    RECIPIENTS.map(to =>
      sendChatDM({
        senderEmail: SENDER_EMAIL,
        recipientEmail: to,
        text: messageText,
        attachment,
      }).then(r => ({ to, ...r }))
    )
  )

  const failed = results.filter(r => !r.success)

  if (failed.length > 0) {
    console.error('[support] send failures:', JSON.stringify(failed, null, 2))
  }

  if (failed.length === results.length) {
    return NextResponse.json(
      {
        error: '送信に失敗しました',
        details: failed.map(f => `${f.to}: ${f.error}`).join(' / '),
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    sent: results.filter(r => r.success).map(r => r.to),
    failed: failed.map(f => ({ to: f.to, error: f.error })),
  })
}
