import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

interface SendInvoiceRequest {
  contactId: string
  spreadsheetId: string
  subject: string
  body: string
}

// Create raw email with PDF attachment
function createEmail(
  to: string,
  from: string,
  subject: string,
  body: string,
  pdfBuffer: Buffer,
  pdfFileName: string
): string {
  const boundary = 'boundary_' + Date.now().toString(16)

  const emailLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${pdfFileName}"`,
    '',
    pdfBuffer.toString('base64'),
    '',
    `--${boundary}--`,
  ]

  return emailLines.join('\r\n')
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body: SendInvoiceRequest = await request.json()
    const { contactId, spreadsheetId, subject, body: emailBody } = body

    // Get contact info
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        name: true,
        company: true,
        email: true,
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    if (!contact.email) {
      return NextResponse.json({ error: 'Contact has no email address' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get file info
    const fileInfo = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'name',
    })
    const fileName = fileInfo.data.name || 'document'

    // Export spreadsheet as PDF
    const pdfResponse = await drive.files.export({
      fileId: spreadsheetId,
      mimeType: 'application/pdf',
    }, {
      responseType: 'arraybuffer',
    })

    const pdfBuffer = Buffer.from(pdfResponse.data as ArrayBuffer)
    const pdfFileName = `${fileName}.pdf`

    // Get sender email
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const fromEmail = profile.data.emailAddress || ''

    // Create email with attachment
    const rawEmail = createEmail(
      contact.email,
      fromEmail,
      subject,
      emailBody,
      pdfBuffer,
      pdfFileName
    )

    // Send email
    const encodedEmail = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Email sent to ${contact.email}`,
    })
  } catch (error: unknown) {
    console.error('Email send error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to send email: ${errorMessage}` }, { status: 500 })
  }
}
