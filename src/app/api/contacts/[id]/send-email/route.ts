/* ************************************************************************** */
/*                                                                            */
/*    route.ts                                          :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/05/09 by Claude (LTS)              #+#    #+#         */
/*    Updated: 2026/05/09 by Claude (LTS)              ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// 注意: 添付ファイル・CC/BCC・スレッド返信は今回スコープ外

/**
 * 文字列を base64URL エンコードする（Gmail API の raw メッセージ用）
 * RFC 4648 Section 5 に準拠: + → -、/ → _、末尾の = を除去
 */
function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * 件名を MIME encoded-word (UTF-8/Base64) 形式にエンコードする
 * 日本語等のマルチバイト文字が含まれる場合の文字化け防止
 */
function encodeMimeSubject(subject: string): string {
  const encoded = Buffer.from(subject, 'utf-8').toString('base64')
  return `=?UTF-8?B?${encoded}?=`
}

/**
 * RFC 2822 形式のメールメッセージを構築する
 */
function buildRawMessage(to: string, subject: string, body: string): string {
  const encodedSubject = encodeMimeSubject(subject)
  const message = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf-8').toString('base64'),
  ].join('\r\n')
  return toBase64Url(message)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params

  try {
    // DB からコンタクト情報を取得
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: {
        email: true,
        emailSubject: true,
        emailBody: true,
        name: true,
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'コンタクトが見つかりません' }, { status: 404 })
    }

    // 必須フィールドの検証
    if (!contact.email) {
      return NextResponse.json(
        { error: '送信先メールアドレス未登録' },
        { status: 400 }
      )
    }
    if (!contact.emailSubject) {
      return NextResponse.json(
        { error: '件名未生成' },
        { status: 400 }
      )
    }
    if (!contact.emailBody) {
      return NextResponse.json(
        { error: '本文未生成' },
        { status: 400 }
      )
    }

    // Gmail API クライアントを初期化
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // RFC 2822 形式のメッセージを構築して base64URL エンコード
    const raw = buildRawMessage(contact.email, contact.emailSubject, contact.emailBody)

    // Gmail API でメール送信（From は "me" = ログインユーザーの Gmail）
    const sendResponse = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })

    const messageId = sendResponse.data.id
    const threadId = sendResponse.data.threadId

    // DB の emailStatus を SENT に更新
    await prisma.contact.update({
      where: { id },
      data: {
        emailStatus: 'SENT',
        emailSentAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true, messageId, threadId })
  } catch (error: unknown) {
    console.error('Gmail send error:', error)

    // Google API のエラーレスポンスを解析
    const apiError = error as { code?: number; errors?: { reason?: string }[] }
    const reason = apiError?.errors?.[0]?.reason

    // スコープ不足（gmail.send 権限なし）
    if (apiError?.code === 403 || reason === 'insufficientPermissions') {
      return NextResponse.json(
        {
          error: 'Gmail送信権限が必要です。再ログインしてください',
          code: 'INSUFFICIENT_SCOPE',
        },
        { status: 403 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `送信に失敗しました: ${errorMessage}` },
      { status: 500 }
    )
  }
}
