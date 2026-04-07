import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { subject, body: emailBody } = body

    const record = await prisma.billingRecord.findUnique({
      where: { id },
      include: {
        Subscription: {
          include: {
            Contact: { select: { id: true, name: true, company: true, email: true } },
          },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
    }

    if (record.status !== 'GENERATED') {
      return NextResponse.json({ error: '請求書がまだ生成されていません' }, { status: 400 })
    }

    const contact = record.Subscription.Contact
    if (!contact.email) {
      return NextResponse.json({ error: 'メールアドレスが未登録です' }, { status: 400 })
    }

    if (!record.spreadsheetId) {
      return NextResponse.json({ error: 'スプレッドシートIDが見つかりません' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get file name (supportsAllDrives: 共有ドライブ対応)
    const fileInfo = await drive.files.get({
      fileId: record.spreadsheetId,
      fields: 'name',
      supportsAllDrives: true,
    })
    const fileName = fileInfo.data.name || 'invoice'

    // Export as PDF (drive.files.exportはsupportsAllDrives不要だがファイルアクセス権限が必要)
    const pdfResponse = await drive.files.export(
      { fileId: record.spreadsheetId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' }
    )
    const pdfBuffer = Buffer.from(pdfResponse.data as ArrayBuffer)

    // Get sender email
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const fromEmail = profile.data.emailAddress || ''

    // Build MIME email
    const boundary = 'boundary_' + Date.now().toString(16)
    const emailLines = [
      `From: ${fromEmail}`,
      `To: ${contact.email}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(emailBody).toString('base64'),
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${fileName}.pdf"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fileName}.pdf"`,
      '',
      pdfBuffer.toString('base64'),
      '',
      `--${boundary}--`,
    ]

    const rawEmail = Buffer.from(emailLines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawEmail },
    })

    // Update billing record
    await prisma.billingRecord.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentMethod: 'EMAIL' },
    })

    return NextResponse.json({ success: true, message: `メール送信完了: ${contact.email}` })
  } catch (error: unknown) {
    console.error('Email send error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
