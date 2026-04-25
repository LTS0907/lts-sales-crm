/* ************************************************************************** */
/*                                                                            */
/*    route.ts                                          :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../auth/[...nextauth]/route'

// カレンダーID → 表示名のマッピング（既知ユーザー）
const CALENDAR_NAME_MAP: Record<string, string> = {
  'r.kabashima@life-time-support.com': '樺嶋',
  'ryouchiku@life-time-support.com': '龍竹',
}

// カレンダーIDからわかりやすい表示名を生成
function getCalendarName(calendarId: string): string {
  if (calendarId === 'primary') return 'primary'
  if (CALENDAR_NAME_MAP[calendarId]) return CALENDAR_NAME_MAP[calendarId]
  // メールアドレスの場合はローカル部分（@より前）を使用
  const atIndex = calendarId.indexOf('@')
  if (atIndex !== -1) {
    return calendarId.substring(0, atIndex)
  }
  return calendarId
}

// 取得対象のカレンダーID一覧を返す。
//   先頭はログインユーザー自身のメール（=自分の予定）。
//   続いて EXTRA_CALENDAR_IDS から自分のメールを除外した他者のカレンダーを並べる。
// これにより、誰がログインしても自分＋他者の全員の予定が（カレンダーID=メール単位で）取得でき、
// フロント側の色マッピングもメールアドレスをキーに統一できる。
function getCalendarIds(userEmail: string | undefined | null): string[] {
  const selfId = userEmail || 'primary'
  const ids: string[] = [selfId]
  const extra = process.env.EXTRA_CALENDAR_IDS
  if (extra) {
    const extraIds = extra
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .filter(id => id !== userEmail) // 自分自身のメールは重複するので除外
    ids.push(...extraIds)
  }
  return ids
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    console.error('No access token in session:', session)
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const timeMin = searchParams.get('timeMin')
  const timeMax = searchParams.get('timeMax')

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const calendarIds = getCalendarIds(session.user?.email)

    // 全カレンダーを並列で取得。1つが失敗しても他は継続する
    const results = await Promise.allSettled(
      calendarIds.map(calendarId =>
        calendar.events.list({
          calendarId,
          timeMin: timeMin || new Date().toISOString(),
          timeMax: timeMax || undefined,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        }).then(response => ({ calendarId, items: response.data.items || [] }))
      )
    )

    const allEvents: {
      id: string | null | undefined
      title: string
      start: string | undefined
      end: string | undefined
      location?: string | null
      description?: string | null
      htmlLink?: string | null
      allDay: boolean
      calendarId: string
      calendarName: string
    }[] = []

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { calendarId, items } = result.value
        const calendarName = getCalendarName(calendarId)
        for (const event of items) {
          allEvents.push({
            id: event.id,
            title: event.summary || '(タイトルなし)',
            start: event.start?.dateTime || event.start?.date || undefined,
            end: event.end?.dateTime || event.end?.date || undefined,
            location: event.location,
            description: event.description,
            htmlLink: event.htmlLink,
            allDay: !event.start?.dateTime,
            calendarId,
            calendarName,
          })
        }
      } else {
        console.error('Failed to fetch calendar:', result.reason)
      }
    }

    // 開始時刻で時系列順にソート
    allEvents.sort((a, b) => {
      const aTime = a.start ? new Date(a.start).getTime() : 0
      const bTime = b.start ? new Date(b.start).getTime() : 0
      return aTime - bTime
    })

    return NextResponse.json(allEvents)
  } catch (error) {
    console.error('Google Calendar API error:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
  }
}

// Convert datetime-local format to ISO 8601 with timezone
function toISOWithTimezone(dateTimeLocal: string): string {
  // datetime-local format: "2026-03-14T09:30"
  // Need to convert to: "2026-03-14T09:30:00+09:00"
  if (dateTimeLocal.includes('+') || dateTimeLocal.includes('Z')) {
    // Already has timezone
    return dateTimeLocal
  }
  // Add seconds if missing
  const withSeconds = dateTimeLocal.length === 16 ? `${dateTimeLocal}:00` : dateTimeLocal
  // Add JST timezone offset
  return `${withSeconds}+09:00`
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { eventId, title, start, end, location, description, allDay, calendarId } = body

    console.log('PATCH request body:', { eventId, calendarId, title, start, end, location, description, allDay })

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const eventUpdate: {
      summary?: string
      location?: string
      description?: string
      start?: { dateTime?: string; date?: string; timeZone?: string }
      end?: { dateTime?: string; date?: string; timeZone?: string }
    } = {}

    if (title !== undefined) eventUpdate.summary = title
    if (location !== undefined) eventUpdate.location = location || undefined
    if (description !== undefined) eventUpdate.description = description || undefined

    if (start) {
      if (allDay) {
        eventUpdate.start = { date: start.split('T')[0] }
      } else {
        eventUpdate.start = { dateTime: toISOWithTimezone(start), timeZone: 'Asia/Tokyo' }
      }
    }

    if (end) {
      if (allDay) {
        eventUpdate.end = { date: end.split('T')[0] }
      } else {
        eventUpdate.end = { dateTime: toISOWithTimezone(end), timeZone: 'Asia/Tokyo' }
      }
    }

    console.log('Event update payload:', JSON.stringify(eventUpdate, null, 2))

    const response = await calendar.events.patch({
      calendarId: calendarId || 'primary',
      eventId: eventId,
      requestBody: eventUpdate,
    })

    return NextResponse.json({
      id: response.data.id,
      title: response.data.summary || '(タイトルなし)',
      start: response.data.start?.dateTime || response.data.start?.date,
      end: response.data.end?.dateTime || response.data.end?.date,
      location: response.data.location,
      description: response.data.description,
      htmlLink: response.data.htmlLink,
      allDay: !response.data.start?.dateTime,
    })
  } catch (error: unknown) {
    console.error('Google Calendar API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const gaxiosError = error as { response?: { data?: { error?: { message?: string } } } }
    const apiError = gaxiosError?.response?.data?.error?.message || errorMessage
    return NextResponse.json({ error: `Failed to update event: ${apiError}` }, { status: 500 })
  }
}

// DELETE /api/google-calendar?eventId=xxx&calendarId=xxx
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('eventId')
  const calendarId = searchParams.get('calendarId') || 'primary'
  const sendUpdates = (searchParams.get('sendUpdates') || 'all') as 'all' | 'externalOnly' | 'none'

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates,
    })

    return NextResponse.json({ ok: true, eventId, calendarId })
  } catch (error: unknown) {
    console.error('Google Calendar DELETE error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const gaxiosError = error as {
      response?: { status?: number; data?: { error?: { message?: string } } }
    }
    const status = gaxiosError?.response?.status || 500
    const apiError = gaxiosError?.response?.data?.error?.message || errorMessage
    // 既に削除済みの場合は成功扱い
    if (status === 404 || status === 410) {
      return NextResponse.json({ ok: true, eventId, calendarId, alreadyGone: true })
    }
    return NextResponse.json({ error: `予定の削除に失敗: ${apiError}` }, { status })
  }
}
