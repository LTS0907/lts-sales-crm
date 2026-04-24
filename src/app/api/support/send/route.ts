/**
 * POST /api/support/send
 *
 * CRM 画面内「サポートに連絡」フォームからの問い合わせを
 * 龍竹・樺嶋の Google Chat DM に cs@ から送信する。
 *
 * リクエスト (multipart/form-data):
 *   - message: string (必須)  問い合わせ本文
 *   - pageUrl: string (任意)  送信元画面の URL
 *   - screenshot: File (任意) スクリーンショット画像
 *
 * レスポンス:
 *   { results: [{ recipient, success, error? }, ...] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import { sendChatDM } from '@/lib/chat-sender'

const SENDER_EMAIL = 'cs@life-time-support.com'
const RECIPIENTS: string[] = [
  'ryouchiku@life-time-support.com',
  'r.kabashima@life-time-support.com',
]

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const form = await request.formData()
    const message = (form.get('message') as string | null)?.trim() || ''
    const pageUrl = (form.get('pageUrl') as string | null) || ''
    const screenshot = form.get('screenshot') as File | null

    if (!message) {
      return NextResponse.json({ error: 'メッセージを入力してください' }, { status: 400 })
    }

    const userName = session.user.name || session.user.email
    const userEmail = session.user.email

    const textLines = [
      '🆘 *CRM サポート依頼*',
      '',
      `👤 送信者: ${userName} (${userEmail})`,
    ]
    if (pageUrl) textLines.push(`🔗 ページ: ${pageUrl}`)
    textLines.push('', '💬 内容:', message)
    const text = textLines.join('\n')

    let attachment: { filename: string; contentType: string; data: Buffer } | undefined
    if (screenshot && screenshot.size > 0) {
      const maxBytes = 10 * 1024 * 1024 // 10MB
      if (screenshot.size > maxBytes) {
        return NextResponse.json(
          { error: 'スクリーンショットは 10MB 以下にしてください' },
          { status: 400 }
        )
      }
      const buf = Buffer.from(await screenshot.arrayBuffer())
      attachment = {
        filename: screenshot.name || 'screenshot.png',
        contentType: screenshot.type || 'image/png',
        data: buf,
      }
    }

    const results = await Promise.all(
      RECIPIENTS.map(async recipient => {
        const r = await sendChatDM({
          senderEmail: SENDER_EMAIL,
          recipientEmail: recipient,
          text,
          attachment,
        })
        if (!r.success) {
          console.error(`[support/send] ${recipient} failed:`, r.error)
        }
        return { recipient, success: r.success, error: r.error }
      })
    )

    const anyFailed = results.some(r => !r.success)
    const allFailed = results.every(r => !r.success)
    return NextResponse.json(
      { results, summary: { anyFailed, allFailed, recipientCount: results.length } },
      { status: allFailed ? 500 : anyFailed ? 207 : 200 }
    )
  } catch (err: unknown) {
    console.error('[support/send] Error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `送信に失敗しました: ${msg}` }, { status: 500 })
  }
}
