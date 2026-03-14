import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

// Decode base64url encoded content
function decodeBase64Url(str: string): string {
  // Replace URL-safe characters
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  try {
    return Buffer.from(padded, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

// Get header value from message headers
function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase())
  return header?.value || ''
}

// Extract text content from message parts
function extractTextContent(payload: any): { text: string; html: string } {
  let text = ''
  let html = ''

  if (!payload) return { text, html }

  // Check if this part has a body with data
  if (payload.body?.data) {
    const content = decodeBase64Url(payload.body.data)
    if (payload.mimeType === 'text/plain') {
      text = content
    } else if (payload.mimeType === 'text/html') {
      html = content
    }
  }

  // Recursively check parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const partContent = extractTextContent(part)
      if (!text && partContent.text) text = partContent.text
      if (!html && partContent.html) html = partContent.html
    }
  }

  return { text, html }
}

// Convert HTML to plain text (basic)
function htmlToText(html: string): string {
  return html
    // Remove style and script tags with content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Replace br and p tags with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: messageId } = await params

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get full message
    const msgDetail = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const headers = msgDetail.data.payload?.headers || []
    const from = getHeader(headers, 'From')
    const to = getHeader(headers, 'To')
    const cc = getHeader(headers, 'Cc')
    const subject = getHeader(headers, 'Subject')
    const date = getHeader(headers, 'Date')

    // Extract content
    const { text, html } = extractTextContent(msgDetail.data.payload)

    // Prefer plain text, fall back to converted HTML
    const body = text || (html ? htmlToText(html) : msgDetail.data.snippet || '')

    return NextResponse.json({
      id: messageId,
      threadId: msgDetail.data.threadId,
      subject: subject || '(件名なし)',
      from,
      to,
      cc,
      date,
      body,
      snippet: msgDetail.data.snippet || '',
    })
  } catch (error: unknown) {
    console.error('Gmail Message API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to fetch message: ${errorMessage}` }, { status: 500 })
  }
}
