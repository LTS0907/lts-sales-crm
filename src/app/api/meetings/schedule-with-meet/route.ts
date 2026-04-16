/**
 * POST /api/meetings/schedule-with-meet
 *
 * Google Calendar にイベントを作成（Meet link自動発行付き）し、
 * Meetingレコードを DB に保存する統合エンドポイント。
 *
 * リクエスト:
 *   {
 *     contactIds: string[]       // 参加者Contact ID一覧
 *     title: string              // 打ち合わせタイトル
 *     date: string               // ISO8601 (JST)
 *     duration: number           // 分
 *     description?: string       // 詳細
 *     inviteParticipants?: boolean  // Calendar招待メール送信
 *     calendarId?: string        // デフォルト: 'primary'
 *     owner?: string             // KAZUI | KABASHIMA | SHARED
 *   }
 *
 * レスポンス:
 *   { meeting, googleEvent }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { authOptions } from '../../auth/[...nextauth]/route'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      contactIds = [],
      title,
      date,
      duration = 30,
      description = '',
      inviteParticipants = true,
      calendarId = 'primary',
      owner = 'KAZUI',
    } = body

    if (!title || !date) {
      return NextResponse.json({ error: 'title と date は必須です' }, { status: 400 })
    }

    // 参加者のContact情報を取得（email付き）
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, name: true, email: true, company: true },
    })

    // 開始・終了時刻を計算
    const startDate = new Date(date)
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000)

    // Google Calendar イベント作成（Meet付き）
    const oauth2 = new google.auth.OAuth2()
    oauth2.setCredentials({ access_token: session.accessToken as string })
    const calendar = google.calendar({ version: 'v3', auth: oauth2 })

    const attendees = inviteParticipants
      ? contacts.filter(c => c.email).map(c => ({ email: c.email!, displayName: c.name }))
      : []

    const eventRes = await calendar.events.insert({
      calendarId,
      sendUpdates: inviteParticipants ? 'all' : 'none',
      conferenceDataVersion: 1,
      requestBody: {
        summary: title,
        description: description || `LTS 打ち合わせ\n\n参加者: ${contacts.map(c => c.name).join('、')}`,
        start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Tokyo' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Tokyo' },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `meet-${crypto.randomUUID()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        // 録画・transcript 自動化が有効な組織なら自動でON
        // reminders 等はユーザー設定に任せる
      },
    })

    const event = eventRes.data
    const meetUrl =
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
      null

    // Meeting レコードを DB に保存
    const meetingId = crypto.randomUUID()
    const meeting = await prisma.meeting.create({
      data: {
        id: meetingId,
        title,
        date: startDate,
        duration,
        notes: description || null,
        googleEventId: event.id || null,
        meetUrl,
        calendarId,
        htmlLink: event.htmlLink || null,
        status: 'SCHEDULED',
        owner,
        MeetingParticipant: {
          create: contactIds.map((cid: string) => ({ contactId: cid })),
        },
      },
      include: { MeetingParticipant: { include: { Contact: true } } },
    })

    return NextResponse.json({
      meeting,
      googleEvent: {
        id: event.id,
        htmlLink: event.htmlLink,
        meetUrl,
      },
    })
  } catch (err: unknown) {
    console.error('[schedule-with-meet] Error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const apiErr = (err as { response?: { data?: { error?: { message?: string } } } })?.response
      ?.data?.error?.message
    return NextResponse.json(
      { error: `打ち合わせ作成に失敗しました: ${apiErr || msg}` },
      { status: 500 }
    )
  }
}
