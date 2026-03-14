import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// Template spreadsheet ID
const TEMPLATE_SPREADSHEET_ID = '1nlcKSgzJehTDBRBCKtoLxeIyppUsh6ARhBa3YIwMcDM'
// Target folder ID for invoices (2026年 folder)
const INVOICE_FOLDER_ID = '1Ey6Z-PWTq8mKjKP9Hk8H8r8X5x5Z5x5Z' // Replace with actual folder ID

interface InvoiceItem {
  date: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
}

interface CreateInvoiceRequest {
  contactId: string
  type: 'invoice' | 'estimate' // 請求書 or 見積書
  subject: string // 件名
  items: InvoiceItem[]
  notes?: string // 備考
  issueDate?: string // 発行日（省略時は今日）
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body: CreateInvoiceRequest = await request.json()
    const { contactId, type, subject, items, notes, issueDate } = body

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

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client })

    // Create document title
    const companyName = contact.company || contact.name
    const typeLabel = type === 'invoice' ? '請求書' : '見積書'
    const today = new Date()
    const dateStr = issueDate || `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`
    const documentTitle = `${companyName}様${typeLabel}（${dateStr}）`

    // Copy the template (supports shared drives)
    const copyResponse = await drive.files.copy({
      fileId: TEMPLATE_SPREADSHEET_ID,
      supportsAllDrives: true,
      requestBody: {
        name: documentTitle,
      },
    })

    const newSpreadsheetId = copyResponse.data.id
    if (!newSpreadsheetId) {
      throw new Error('Failed to copy template')
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    const tax = Math.floor(subtotal * 0.1)
    const total = subtotal + tax

    // Format date for display
    const issueDateObj = issueDate ? new Date(issueDate) : today
    const formattedDate = `${issueDateObj.getFullYear()}年${issueDateObj.getMonth() + 1}月${issueDateObj.getDate()}日`

    // Prepare batch update values
    const updates: { range: string; values: (string | number)[][] }[] = [
      // Title (B2) - 請求書 or 見積書
      { range: 'B2', values: [[type === 'invoice' ? '請　求　書' : '見　積　書']] },
      // Issue date (D4)
      { range: 'D4', values: [[`発行年月日：${formattedDate}`]] },
      // Company name (B6)
      { range: 'B6', values: [[`${companyName}様`]] },
      // Subject (B8)
      { range: 'B8', values: [[`件名：${subject}`]] },
      // Total amount (B13)
      { range: 'B13', values: [[`¥${total.toLocaleString()}`]] },
    ]

    // Add line items (starting from row 16)
    items.forEach((item, index) => {
      const row = 16 + index
      if (row <= 33) { // Max 18 items (rows 16-33)
        updates.push({
          range: `A${row}:I${row}`,
          values: [[
            item.date,
            item.description,
            '', // Empty column
            item.quantity,
            item.unit,
            `¥${item.unitPrice.toLocaleString()}`,
            '', // Empty column
            '', // Empty column
            `¥${(item.quantity * item.unitPrice).toLocaleString()}`,
          ]],
        })
      }
    })

    // Subtotal, tax, total (rows 34-36)
    updates.push(
      { range: 'I34', values: [[`¥${subtotal.toLocaleString()}`]] },
      { range: 'I35', values: [[`¥${tax.toLocaleString()}`]] },
      { range: 'I36', values: [[`¥${total.toLocaleString()}`]] },
    )

    // Notes (B35)
    if (notes) {
      updates.push({ range: 'B35', values: [[`備考：${notes}`]] })
    }

    // Apply all updates
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: newSpreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    })

    // Get the spreadsheet URL
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`

    return NextResponse.json({
      success: true,
      spreadsheetId: newSpreadsheetId,
      spreadsheetUrl,
      documentTitle,
      total,
    })
  } catch (error: unknown) {
    console.error('Invoice creation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create invoice: ${errorMessage}` }, { status: 500 })
  }
}
