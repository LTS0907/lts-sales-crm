import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

interface EmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  fromEmail: string
  fromDomain: string
  to: string
  toEmail: string
  toDomain: string
  date: string
  snippet: string
  isIncoming: boolean
}

interface MatchedContact {
  id: string
  name: string
  company: string | null
  email: string | null
  domain: string
  emails: EmailMessage[]
  latestEmailDate: string
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

// List of common free email domains
const FREE_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.jp',
  'hotmail.com',
  'outlook.com',
  'outlook.jp',
  'live.com',
  'live.jp',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'mail.com',
  'protonmail.com',
  'zoho.com',
  'ymail.com',
  'googlemail.com',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'ymobile.ne.jp',
  'rakuten.jp',
  'nifty.com',
  'biglobe.ne.jp',
  'ocn.ne.jp',
  'plala.or.jp',
  'so-net.ne.jp',
]

function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.includes(domain.toLowerCase())
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
  const maxResults = parseInt(searchParams.get('maxResults') || '100')
  const daysBack = parseInt(searchParams.get('daysBack') || '30')

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get user's email address
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const myEmail = profile.data.emailAddress?.toLowerCase() || ''
    const myDomain = extractDomain(myEmail)

    // Get all contacts with email addresses
    const contacts = await prisma.contact.findMany({
      where: {
        email: {
          not: null,
        },
        NOT: {
          email: '',
        },
      },
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
      },
    })

    // Build mapping for contacts
    // For free email domains: use full email as key (exact match)
    // For company domains: use domain as key (domain match)
    const emailToContacts: Record<string, typeof contacts> = {}  // For free email (exact match)
    const domainToContacts: Record<string, typeof contacts> = {} // For company domain
    const knownFreeEmails = new Set<string>() // Track known free email addresses
    const knownCompanyDomains = new Set<string>() // Track known company domains

    for (const contact of contacts) {
      if (contact.email) {
        const email = contact.email.toLowerCase()
        const domain = extractDomain(email)
        if (domain && domain !== myDomain) {
          if (isFreeEmailDomain(domain)) {
            // Free email: exact match
            if (!emailToContacts[email]) {
              emailToContacts[email] = []
            }
            emailToContacts[email].push(contact)
            knownFreeEmails.add(email)
          } else {
            // Company domain: domain match
            if (!domainToContacts[domain]) {
              domainToContacts[domain] = []
            }
            domainToContacts[domain].push(contact)
            knownCompanyDomains.add(domain)
          }
        }
      }
    }

    // Calculate date filter
    const afterDate = new Date()
    afterDate.setDate(afterDate.getDate() - daysBack)
    const afterStr = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`

    // Check if we have any contacts to match
    if (knownFreeEmails.size === 0 && knownCompanyDomains.size === 0) {
      return NextResponse.json({
        myEmail,
        myDomain,
        matchedContacts: [],
        unmatchedDomains: [],
        totalEmails: 0,
      })
    }

    // List messages from inbox and sent
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      q: `after:${afterStr} (in:inbox OR in:sent)`,
    })

    const messages = listResponse.data.messages || []

    // Fetch message details and match with contacts
    // For company domains: group by domain
    // For free emails: group by exact email address
    const emailsByDomain: Record<string, EmailMessage[]> = {} // For company domain matching
    const emailsByEmail: Record<string, EmailMessage[]> = {} // For free email exact matching
    const unmatchedDomains: Set<string> = new Set()

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
        const toDomain = extractDomain(toEmail)

        // Determine if incoming or outgoing
        const isIncoming = fromDomain !== myDomain
        const otherDomain = isIncoming ? fromDomain : toDomain

        // Skip internal emails
        if (otherDomain === myDomain || !otherDomain) continue

        const emailData: EmailMessage = {
          id: msg.id!,
          threadId: msg.threadId!,
          subject: subject || '(件名なし)',
          from,
          fromEmail,
          fromDomain,
          to,
          toEmail,
          toDomain,
          date,
          snippet: msgDetail.data.snippet || '',
          isIncoming,
        }

        // Get the other party's email address
        const otherEmail = isIncoming ? fromEmail : toEmail

        // Check if this is a free email domain
        if (isFreeEmailDomain(otherDomain)) {
          // Free email: check exact email match
          if (emailToContacts[otherEmail]) {
            if (!emailsByEmail[otherEmail]) {
              emailsByEmail[otherEmail] = []
            }
            emailsByEmail[otherEmail].push(emailData)
          } else {
            unmatchedDomains.add(otherDomain)
          }
        } else {
          // Company domain: check domain match
          if (domainToContacts[otherDomain]) {
            if (!emailsByDomain[otherDomain]) {
              emailsByDomain[otherDomain] = []
            }
            emailsByDomain[otherDomain].push(emailData)
          } else {
            unmatchedDomains.add(otherDomain)
          }
        }
      } catch (err) {
        console.error('Error fetching message:', msg.id, err)
      }
    }

    // Build matched contacts response
    const matchedContacts: MatchedContact[] = []

    // Process company domain matches
    for (const domain of Object.keys(emailsByDomain)) {
      const contactsForDomain = domainToContacts[domain]
      const emails = emailsByDomain[domain]

      // Sort emails by date (newest first)
      emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      for (const contact of contactsForDomain) {
        matchedContacts.push({
          id: contact.id,
          name: contact.name,
          company: contact.company,
          email: contact.email,
          domain,
          emails,
          latestEmailDate: emails[0]?.date || '',
        })
      }
    }

    // Process free email matches (exact email match)
    for (const email of Object.keys(emailsByEmail)) {
      const contactsForEmail = emailToContacts[email]
      const emails = emailsByEmail[email]
      const domain = extractDomain(email)

      // Sort emails by date (newest first)
      emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      for (const contact of contactsForEmail) {
        matchedContacts.push({
          id: contact.id,
          name: contact.name,
          company: contact.company,
          email: contact.email,
          domain,
          emails,
          latestEmailDate: emails[0]?.date || '',
        })
      }
    }

    // Sort by latest email date
    matchedContacts.sort((a, b) =>
      new Date(b.latestEmailDate).getTime() - new Date(a.latestEmailDate).getTime()
    )

    // Calculate total emails
    const totalDomainEmails = Object.values(emailsByDomain).flat().length
    const totalEmailEmails = Object.values(emailsByEmail).flat().length

    return NextResponse.json({
      myEmail,
      myDomain,
      matchedContacts,
      unmatchedDomains: Array.from(unmatchedDomains).sort(),
      totalEmails: totalDomainEmails + totalEmailEmails,
    })
  } catch (error: unknown) {
    console.error('Gmail Match API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to match emails: ${errorMessage}` }, { status: 500 })
  }
}

// POST: Add email exchange to contact
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { contactId, emailId, subject, snippet, date, isIncoming } = body

    // Create exchange record
    const exchange = await prisma.exchange.create({
      data: {
        id: crypto.randomUUID(),
        contactId,
        description: `${isIncoming ? '📥 受信' : '📤 送信'}: ${subject}\n${snippet}`,
        direction: isIncoming ? 'INCOMING' : 'OUTGOING',
      },
    })

    return NextResponse.json({ success: true, exchange })
  } catch (error: unknown) {
    console.error('Exchange creation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create exchange: ${errorMessage}` }, { status: 500 })
  }
}
