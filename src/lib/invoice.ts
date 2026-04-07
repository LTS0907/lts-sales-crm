import { google } from 'googleapis'

const TEMPLATE_SPREADSHEET_ID = '1nlcKSgzJehTDBRBCKtoLxeIyppUsh6ARhBa3YIwMcDM'
const RECEIPT_TEMPLATE_ID = '1MKEOTY-WDryVejLrFa6QEqgbIn2E4kcr'
const DRIVE_PARENT_FOLDER_ID = '1DoOMSUitZ3Sv6HowcGlTS2lMcF2wxfJI'

export interface InvoiceItem {
  date: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
}

export interface CreateInvoiceParams {
  accessToken: string
  contact: {
    id: string
    name: string
    company: string | null
    driveFolderId: string | null
  }
  type: 'invoice' | 'estimate' | 'receipt'
  subject: string
  items: InvoiceItem[]
  notes?: string
  issueDate?: string
  createDriveFolder?: boolean
}

export interface CreateInvoiceResult {
  spreadsheetId: string
  spreadsheetUrl: string
  documentTitle: string
  subtotal: number
  tax: number
  total: number
  movedToDrive: boolean
  driveFolderId: string | null
  driveCreated: boolean
}

export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const { accessToken, contact, type, subject, items, notes, issueDate, createDriveFolder } = params

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

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

  // Copy the template
  const copyResponse = await drive.files.copy({
    fileId: templateId,
    supportsAllDrives: true,
    requestBody: { name: documentTitle },
  })

  const newSpreadsheetId = copyResponse.data.id
  if (!newSpreadsheetId) throw new Error('Failed to copy template')

  // Format date for display
  const issueDateObj = issueDate ? new Date(issueDate) : today
  const formattedDate = `${issueDateObj.getFullYear()}年${issueDateObj.getMonth() + 1}月${issueDateObj.getDate()}日`

  let total: number
  let subtotal: number
  let tax: number
  const updates: { range: string; values: (string | number)[][] }[] = []

  if (type === 'receipt') {
    total = items[0]?.unitPrice || 0
    // 領収書は税込総額のみ。税抜は逆算（税込/1.1）
    subtotal = Math.floor(total / 1.1)
    tax = total - subtotal
    updates.push(
      { range: 'A5', values: [[`${companyName}様`]] },
      { range: 'F4', values: [[`発行年月日：${formattedDate}`]] },
      { range: 'B13', values: [[`¥${total.toLocaleString()}-`]] },
      { range: 'A8', values: [[`但　${subject}`]] },
    )
    if (notes) updates.push({ range: 'A37', values: [[notes]] })
  } else {
    subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    tax = Math.floor(subtotal * 0.1)
    total = subtotal + tax

    updates.push(
      { range: 'A2', values: [[type === 'invoice' ? '請　求　書' : '見　積　書']] },
      { range: 'F4', values: [[`発行年月日：${formattedDate}`]] },
      { range: 'A5', values: [[`${companyName}様`]] },
      { range: 'A8', values: [[`件名：${subject}`]] },
      { range: 'B13', values: [[`¥${total.toLocaleString()}`]] },
    )

    items.forEach((item, index) => {
      const row = 16 + index
      if (row <= 35) {
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

    updates.push(
      { range: 'I36', values: [[`¥${subtotal.toLocaleString()}`]] },
      { range: 'I37', values: [[`¥${tax.toLocaleString()}`]] },
      { range: 'I38', values: [[`¥${total.toLocaleString()}`]] },
    )

    if (notes) updates.push({ range: 'A37', values: [[notes]] })
  }

  // Apply all updates
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: newSpreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
  })

  // Move to contact's Drive folder
  let driveFolderId = contact.driveFolderId
  let driveCreated = false

  if (!driveFolderId && createDriveFolder) {
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
    driveCreated = true
  }

  let movedToDrive = false
  if (driveFolderId) {
    try {
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

  return {
    spreadsheetId: newSpreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`,
    documentTitle,
    subtotal,
    tax,
    total,
    movedToDrive,
    driveFolderId: driveFolderId || null,
    driveCreated,
  }
}
