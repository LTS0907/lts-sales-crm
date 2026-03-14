import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

// Template spreadsheet ID
const TEMPLATE_SPREADSHEET_ID = '1nlcKSgzJehTDBRBCKtoLxeIyppUsh6ARhBa3YIwMcDM'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client })

    // Get all data from the template
    const response = await sheets.spreadsheets.get({
      spreadsheetId: TEMPLATE_SPREADSHEET_ID,
      includeGridData: true,
    })

    // Extract sheet structure
    const sheetData = response.data.sheets?.[0]
    const gridData = sheetData?.data?.[0]
    const rowData = gridData?.rowData || []

    // Build a simple representation of the template
    const cells: { row: number; col: number; value: string; colLetter: string }[] = []

    rowData.forEach((row, rowIndex) => {
      row.values?.forEach((cell, colIndex) => {
        const value = cell.formattedValue || cell.userEnteredValue?.stringValue || ''
        if (value) {
          const colLetter = String.fromCharCode(65 + colIndex) // A, B, C, ...
          cells.push({
            row: rowIndex + 1,
            col: colIndex + 1,
            colLetter,
            value,
          })
        }
      })
    })

    return NextResponse.json({
      spreadsheetId: TEMPLATE_SPREADSHEET_ID,
      title: response.data.properties?.title,
      sheetName: sheetData?.properties?.title,
      cells,
    })
  } catch (error: unknown) {
    console.error('Sheets API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to fetch template: ${errorMessage}` }, { status: 500 })
  }
}
