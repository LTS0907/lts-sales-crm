import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

interface EmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  fromEmail: string
  to: string
  toEmail: string
  date: string
  snippet: string
  isIncoming: boolean
}

// Extract email address from "Name <email@domain.com>" format
function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase()
  return str.trim().toLowerCase()
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const maxResults = parseInt(searchParams.get('maxResults') || '50')

  try {
    // Get contact email
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: { email: true, name: true },
    })

    if (!contact?.email) {
      return NextResponse.json({ emails: [], message: 'No email address for this contact' })
    }

    const contactDomain = extractDomain(contact.email)
    if (!contactDomain) {
      return NextResponse.json({ emails: [], message: 'Invalid email domain' })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get user's email address
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const myEmail = profile.data.emailAddress?.toLowerCase() || ''
    const myDomain = extractDomain(myEmail)

    // Search for emails with this domain
    const query = `(from:@${contactDomain} OR to:@${contactDomain})`

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      q: query,
    })

    const messages = listResponse.data.messages || []
    const emailMessages: EmailMessage[] = []

    for (const msg of messages) {
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

        // Determine if incoming or outgoing
        const isIncoming = fromDomain !== myDomain

        emailMessages.push({
          id: msg.id!,
          threadId: msg.threadId!,
          subject: subject || '(件名なし)',
          from,
          fromEmail,
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

    // Sort by date descending
    emailMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      contactName: contact.name,
      contactEmail: contact.email,
      contactDomain,
      emails: emailMessages,
    })
  } catch (error: unknown) {
    console.error('Gmail API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to fetch emails: ${errorMessage}` }, { status: 500 })
  }
}
