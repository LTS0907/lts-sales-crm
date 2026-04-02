import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { createInvoice, InvoiceItem } from '@/lib/invoice'

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

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    console.error('Invoice creation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create invoice: ${errorMessage}` }, { status: 500 })
  }
}
