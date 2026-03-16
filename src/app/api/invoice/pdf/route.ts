import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const spreadsheetId = searchParams.get('spreadsheetId')

  if (!spreadsheetId) {
    return NextResponse.json({ error: 'spreadsheetId is required' }, { status: 400 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get file name
    const fileInfo = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'name',
      supportsAllDrives: true,
    })
    const fileName = fileInfo.data.name || 'document'

    // Export as PDF
    const response = await drive.files.export({
      fileId: spreadsheetId,
      mimeType: 'application/pdf',
    }, {
      responseType: 'arraybuffer',
    })

    const pdfBuffer = Buffer.from(response.data as ArrayBuffer)

    // Return PDF with proper headers
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}.pdf"`,
      },
    })
  } catch (error: unknown) {
    console.error('PDF export error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to export PDF: ${errorMessage}` }, { status: 500 })
  }
}
