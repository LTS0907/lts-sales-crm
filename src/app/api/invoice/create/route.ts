/* ************************************************************************** */
/*                                                                            */
/*    route.ts                                          :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// Template spreadsheet IDs
const TEMPLATE_SPREADSHEET_ID = '1nlcKSgzJehTDBRBCKtoLxeIyppUsh6ARhBa3YIwMcDM' // 見積書・請求書
const RECEIPT_TEMPLATE_ID = '1MKEOTY-WDryVejLrFa6QEqgbIn2E4kcr' // 領収書
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
  type: 'invoice' | 'estimate' | 'receipt' // 請求書 or 見積書 or 領収書
  subject: string // 件名
  items: InvoiceItem[]
  notes?: string // 備考
  issueDate?: string // 発行日（省略時は今日）
  createDriveFolder?: boolean // Driveフォルダがない場合に作成するか
}

const DRIVE_PARENT_FOLDER_ID = '1Z_tAkH5jEk5MVMGaajArqcLKI2dqbu40'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body: CreateInvoiceRequest = await request.json()
    const { contactId, type, subject, items, notes, issueDate, createDriveFolder } = body

    // Get contact info
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        driveFolderId: true,
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
    const typeLabel = type === 'invoice' ? '請求書' : type === 'receipt' ? '領収書' : '見積書'
    const today = new Date()
    const dateStr = issueDate || `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`
    const documentTitle = `${companyName}様${typeLabel}（${dateStr}）`

    // Select template based on type
    const templateId = type === 'receipt' ? RECEIPT_TEMPLATE_ID : TEMPLATE_SPREADSHEET_ID

    // Copy the template (supports shared drives)
    const copyResponse = await drive.files.copy({
      fileId: templateId,
      supportsAllDrives: true,
      requestBody: {
        name: documentTitle,
      },
    })

    const newSpreadsheetId = copyResponse.data.id
    if (!newSpreadsheetId) {
      throw new Error('Failed to copy template')
    }

    // Format date for display
    const issueDateObj = issueDate ? new Date(issueDate) : today
    const formattedDate = `${issueDateObj.getFullYear()}年${issueDateObj.getMonth() + 1}月${issueDateObj.getDate()}日`

    let total: number
    const updates: { range: string; values: (string | number)[][] }[] = []

    if (type === 'receipt') {
      // 領収書: 金額はitems[0].unitPriceに格納されている
      total = items[0]?.unitPrice || 0

      // ※ 領収書テンプレートのセル構成（要確認・調整）
      // テンプレートをコピーして宛名・日付・金額・但し書きを書き込む
      updates.push(
        // 宛名
        { range: 'A5', values: [[`${companyName}様`]] },
        // 発行日
        { range: 'F4', values: [[`発行年月日：${formattedDate}`]] },
        // 金額
        { range: 'B13', values: [[`¥${total.toLocaleString()}-`]] },
        // 但し書き（件名）
        { range: 'A8', values: [[`但　${subject}`]] },
      )

      if (notes) {
        updates.push({ range: 'A37', values: [[notes]] })
      }
    } else {
      // 見積書・請求書
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
      const tax = Math.floor(subtotal * 0.1)
      total = subtotal + tax

      // ※ テンプレートは結合セルを多用。必ず結合の「親セル（左上）」に書き込むこと。
      updates.push(
        // Title (A2) - 請求書 or 見積書（A2:D2結合、親=A2）
        { range: 'A2', values: [[type === 'invoice' ? '請　求　書' : '見　積　書']] },
        // Issue date (F4) - F4:I4結合、親=F4
        { range: 'F4', values: [[`発行年月日：${formattedDate}`]] },
        // Company name (A5) - A5:D6結合、親=A5（確認済み）
        { range: 'A5', values: [[`${companyName}様`]] },
        // Subject (A8) - A8:D8結合、親=A8（確認済み）
        { range: 'A8', values: [[`件名：${subject}`]] },
        // Total amount (B13)
        { range: 'B13', values: [[`¥${total.toLocaleString()}`]] },
      )

      // Add line items (starting from row 16)
      // 列構成: A=日付, B=作業内容(B:D結合・親B), C/D=スレーブ, E=数量, F=単位, G=単価, H=計算式（触らない）, I=金額
      items.forEach((item, index) => {
        const row = 16 + index
        if (row <= 35) { // Max 20 items (rows 16-35)
          updates.push(
            { range: `A${row}`, values: [[item.date]] },
            { range: `B${row}`, values: [[item.description]] },
            { range: `E${row}`, values: [[item.quantity]] },
            { range: `F${row}`, values: [[item.unit]] },
            { range: `G${row}`, values: [[item.unitPrice]] },
            { range: `I${row}`, values: [[item.quantity * item.unitPrice]] },
          )
        }
      })

      // Subtotal, tax, total (rows 36-38)
      updates.push(
        { range: 'I36', values: [[`¥${subtotal.toLocaleString()}`]] },
        { range: 'I37', values: [[`¥${tax.toLocaleString()}`]] },
        { range: 'I38', values: [[`¥${total.toLocaleString()}`]] },
      )

      if (notes) {
        updates.push({ range: 'A37', values: [[notes]] })
      }
    }

    // Apply all updates
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: newSpreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    })

    // Move to contact's Drive folder
    let driveFolderId = contact.driveFolderId
    let driveCreated = false

    if (!driveFolderId && createDriveFolder) {
      // Create Drive folder for the contact
      const folderName = `${contact.company || contact.name}　${contact.id}`
      const folderRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [DRIVE_PARENT_FOLDER_ID],
        },
        fields: 'id',
        supportsAllDrives: true,
      })
      driveFolderId = folderRes.data.id!
      await prisma.contact.update({ where: { id: contact.id }, data: { driveFolderId } })
      driveCreated = true
    }

    let movedToDrive = false
    if (driveFolderId) {
      try {
        // Get current parent to remove it, then add new parent
        const fileInfo = await drive.files.get({
          fileId: newSpreadsheetId,
          fields: 'parents',
          supportsAllDrives: true,
        })
        const previousParents = (fileInfo.data.parents || []).join(',')
        await drive.files.update({
          fileId: newSpreadsheetId,
          addParents: driveFolderId,
          removeParents: previousParents,
          supportsAllDrives: true,
        })
        movedToDrive = true
      } catch (moveErr) {
        console.error('Failed to move file to Drive folder:', moveErr)
      }
    }

    // Get the spreadsheet URL
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`

    return NextResponse.json({
      success: true,
      spreadsheetId: newSpreadsheetId,
      spreadsheetUrl,
      documentTitle,
      total,
      movedToDrive,
      driveFolderId: driveFolderId || null,
      driveCreated,
    })
  } catch (error: unknown) {
    console.error('Invoice creation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create invoice: ${errorMessage}` }, { status: 500 })
  }
}
