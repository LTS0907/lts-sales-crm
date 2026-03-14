import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../auth/[...nextauth]/route'

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

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || undefined,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    })

    const events = response.data.items?.map(event => ({
      id: event.id,
      title: event.summary || '(タイトルなし)',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      description: event.description,
      htmlLink: event.htmlLink,
      allDay: !event.start?.dateTime,
    })) || []

    return NextResponse.json(events)
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
    const { eventId, title, start, end, location, description, allDay } = body

    console.log('PATCH request body:', { eventId, title, start, end, location, description, allDay })

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
      calendarId: 'primary',
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
