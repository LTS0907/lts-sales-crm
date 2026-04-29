/**
 * POST /api/support/send
 *
 * CRM 画面内「サポートに連絡」フォームからの問い合わせを
 * Google Chat「LTS開発サポート」スペースに cs@ から送信する。
 *
 * - 本文 + 1枚目の写真 を主メッセージとして投稿
 * - 2枚目以降は同スレッドへの返信メッセージとして連投
 * - SUPPORT_GROUP_SPACE_ID 未設定時は龍竹・樺嶋へ個別DMにフォールバック
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import { sendChatDM, sendChatToSpace } from '@/lib/chat-sender'

const SENDER_EMAIL = 'cs@life-time-support.com'
const FALLBACK_RECIPIENTS = [
  'ryouchiku@life-time-support.com',
  'r.kabashima@life-time-support.com',
]

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_ATTACHMENTS = 10

type Attachment = { filename: string; contentType: string; data: Buffer }

async function fileToAttachment(file: File, fallbackName: string): Promise<Attachment | null> {
  if (file.size === 0) return null
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`画像「${file.name || fallbackName}」が10MB超のため添付できません`)
  }
  const buf = Buffer.from(await file.arrayBuffer())
  const safeName =
    file.name && /\.[a-z0-9]+$/i.test(file.name) ? file.name : `${fallbackName}.png`
  return {
    filename: safeName,
    contentType: file.type || 'image/png',
    data: buf,
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const text = String(formData.get('text') ?? '').trim()
  const pageUrl = String(formData.get('pageUrl') ?? '').trim()

  if (!text) {
    return NextResponse.json({ error: '本文を入力してください' }, { status: 400 })
  }

  // 'screenshots' (複数) と 'screenshot' (旧来1枚) の両方を受け取る
  const rawFiles: File[] = []
  for (const v of formData.getAll('screenshots')) {
    if (v instanceof File) rawFiles.push(v)
  }
  const legacy = formData.get('screenshot')
  if (legacy instanceof File && legacy.size > 0) rawFiles.push(legacy)

  if (rawFiles.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `添付は最大${MAX_ATTACHMENTS}枚まで` },
      { status: 413 }
    )
  }

  let attachments: Attachment[] = []
  try {
    attachments = (
      await Promise.all(
        rawFiles.map((f, i) => fileToAttachment(f, `screenshot-${Date.now()}-${i + 1}`))
      )
    ).filter((a): a is Attachment => a !== null)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '画像処理に失敗しました' },
      { status: 413 }
    )
  }

  const senderName = session.user.name ?? '(名前不明)'
  const senderEmail = session.user.email
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const photoLine = attachments.length > 0 ? `📎 添付: ${attachments.length}枚` : null

  const messageText = [
    '📩 *Sales CRM サポート問い合わせ*',
    '',
    `👤 差出人: ${senderName} (${senderEmail})`,
    `🕒 送信日時: ${now}`,
    pageUrl ? `🔗 ページ: ${pageUrl}` : null,
    photoLine,
    '',
    '—— 本文 ——',
    text,
  ]
    .filter(l => l !== null)
    .join('\n')

  // 1. グループChatスペースに送信（推奨）
  if (process.env.SUPPORT_GROUP_SPACE_ID) {
    // 主メッセージ（本文＋1枚目）
    const main = await sendChatToSpace({
      senderEmail: SENDER_EMAIL,
      text: messageText,
      attachment: attachments[0],
    })
    if (!main.success) {
      console.error('[support] group main send failed:', main.error)
      return NextResponse.json(
        { error: '送信に失敗しました', details: main.error },
        { status: 500 }
      )
    }

    // 2枚目以降を同スレッドに連投
    const followUps: { idx: number; ok: boolean; error?: string }[] = []
    for (let i = 1; i < attachments.length; i++) {
      const r = await sendChatToSpace({
        senderEmail: SENDER_EMAIL,
        text: `📎 追加写真 ${i + 1}/${attachments.length}`,
        attachment: attachments[i],
        threadName: main.threadName,
      })
      followUps.push({ idx: i + 1, ok: r.success, error: r.error })
      if (!r.success) {
        console.error(`[support] follow-up #${i + 1} failed:`, r.error)
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'group',
      attachments: attachments.length,
      followUps,
    })
  }

  // 2. フォールバック: 個別DM（複数枚は1枚目のみ添付）
  const results = await Promise.all(
    FALLBACK_RECIPIENTS.map(to =>
      sendChatDM({
        senderEmail: SENDER_EMAIL,
        recipientEmail: to,
        text: messageText,
        attachment: attachments[0],
      }).then(r => ({ to, ...r }))
    )
  )

  const failed = results.filter(r => !r.success)
  if (failed.length > 0) {
    console.error('[support] DM send failures:', JSON.stringify(failed, null, 2))
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
    mode: 'fallback-dm',
    sent: results.filter(r => r.success).map(r => r.to),
    failed: failed.map(f => ({ to: f.to, error: f.error })),
  })
}
