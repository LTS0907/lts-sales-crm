import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'

export async function GET(request: Request) {
  const session = await getServerSession()

  if (!session?.accessToken) {
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
