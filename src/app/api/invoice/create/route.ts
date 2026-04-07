import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { createInvoice, InvoiceItem } from '@/lib/invoice'
import { createReceivableWithRevenue } from '@/lib/accounts-receivable'

interface CreateInvoiceRequest {
  contactId: string
  type: 'invoice' | 'estimate' | 'receipt'
  subject: string
  items: InvoiceItem[]
  notes?: string
  issueDate?: string
  createDriveFolder?: boolean
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body: CreateInvoiceRequest = await request.json()
    const { contactId, type, subject, items, notes, issueDate, createDriveFolder } = body

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, company: true, email: true, driveFolderId: true },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const result = await createInvoice({
      accessToken: session.accessToken,
      contact,
      type,
      subject,
      items,
      notes,
      issueDate,
      createDriveFolder,
    })

    // Update contact's driveFolderId if a new folder was created
    if (result.driveCreated && result.driveFolderId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { driveFolderId: result.driveFolderId },
      })
    }

    // 請求書の場合のみ、売掛金 + 売上を自動計上（発生主義）
    let accountsReceivable = null
    if (type === 'invoice' && result.total > 0) {
      // issueDate の検証：空文字 or 不正値は今日に fallback
      let invoicedAt = new Date()
      if (issueDate && issueDate.trim()) {
        const parsed = new Date(issueDate)
        if (!isNaN(parsed.getTime())) invoicedAt = parsed
      }

      const ar = await createReceivableWithRevenue({
        contactId: contact.id,
        source: 'MANUAL',
        serviceName: subject,
        invoiceSubject: subject,
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        amount: result.total,
        subtotal: result.subtotal,
        taxAmount: result.tax,
        invoicedAt,
      })
      accountsReceivable = ar.accountsReceivable
    }

    return NextResponse.json({ success: true, ...result, accountsReceivable })
  } catch (error: unknown) {
    console.error('Invoice creation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create invoice: ${errorMessage}` }, { status: 500 })
  }
}
