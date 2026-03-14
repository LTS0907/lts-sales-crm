import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../auth/[...nextauth]/route'

interface EmailThread {
  id: string
  threadId: string
  subject: string
  from: string
  fromEmail: string
  fromDomain: string
  to: string
  toEmail: string
  date: string
  snippet: string
  isIncoming: boolean
}

// Extract email address from "Name <email@domain.com>" format
function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/)
  if (match) return match[1]
  // If no angle brackets, return as-is (already just email)
  return str.trim()
}

// Extract domain from email address
function extractDomain(email: string): string {
  const parts = email.split('@')
  return parts.length > 1 ? parts[1].toLowerCase() : ''
}

// Get header value from message headers
function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase())
  return header?.value || ''
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const maxResults = parseInt(searchParams.get('maxResults') || '50')
  const domain = searchParams.get('domain') // Optional: filter by domain
  const after = searchParams.get('after') // Optional: date filter (YYYY/MM/DD)

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Build search query
    let query = 'in:inbox OR in:sent'
    if (domain) {
      query = `(from:@${domain} OR to:@${domain})`
    }
    if (after) {
      query += ` after:${after}`
    }

    // Get user's email address
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const myEmail = profile.data.emailAddress || ''
    const myDomain = extractDomain(myEmail)

    // List messages
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      q: query,
    })

    const messages = listResponse.data.messages || []

    // Fetch message details
    const emailThreads: EmailThread[] = []

    for (const msg of messages.slice(0, maxResults)) {
      try {
        const msgDetail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        })

        const headers = msgDetail.data.payload?.headers || []
        const from = getHeader(headers, 'From')
        const to = getHeader(headers, 'To')
        const subject = getHeader(headers, 'Subject')
        const date = getHeader(headers, 'Date')

        const fromEmail = extractEmail(from)
        const toEmail = extractEmail(to)
        const fromDomain = extractDomain(fromEmail)
        const toDomain = extractDomain(toEmail)

        // Determine if incoming or outgoing
        const isIncoming = fromDomain !== myDomain

        // Skip internal emails (same domain as user)
        const otherDomain = isIncoming ? fromDomain : toDomain
        if (otherDomain === myDomain) continue

        emailThreads.push({
          id: msg.id!,
          threadId: msg.threadId!,
          subject: subject || '(件名なし)',
          from,
          fromEmail,
          fromDomain,
          to,
          toEmail,
          date,
          snippet: msgDetail.data.snippet || '',
          isIncoming,
        })
      } catch (err) {
        console.error('Error fetching message:', msg.id, err)
      }
    }

    // Group by domain and count
    const domainStats: Record<string, {
      domain: string
      count: number
      latestDate: string
      emails: EmailThread[]
    }> = {}

    for (const email of emailThreads) {
      const otherDomain = email.isIncoming ? email.fromDomain : extractDomain(email.toEmail)

      if (!domainStats[otherDomain]) {
        domainStats[otherDomain] = {
          domain: otherDomain,
          count: 0,
          latestDate: email.date,
          emails: [],
        }
      }

      domainStats[otherDomain].count++
      domainStats[otherDomain].emails.push(email)
    }

    return NextResponse.json({
      myEmail,
      myDomain,
      totalEmails: emailThreads.length,
      domainStats: Object.values(domainStats).sort((a, b) => b.count - a.count),
      emails: emailThreads,
    })
  } catch (error: unknown) {
    console.error('Gmail API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to fetch emails: ${errorMessage}` }, { status: 500 })
  }
}
