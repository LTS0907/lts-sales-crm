import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { createInvoice } from '@/lib/invoice'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params

  try {
    const record = await prisma.billingRecord.findUnique({
      where: { id },
      include: {
        Subscription: {
          include: {
            Contact: { select: { id: true, name: true, company: true, email: true, driveFolderId: true } },
          },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
    }

    if (!record.amountConfirmed || record.amount == null) {
      return NextResponse.json({ error: '金額が未確定です' }, { status: 400 })
    }

    if (record.status === 'GENERATED' || record.status === 'SENT') {
      return NextResponse.json({ error: '既に請求書が生成されています' }, { status: 400 })
    }

    const sub = record.Subscription
    const contact = sub.Contact

    // Build invoice date from billing month
    const [year, month] = record.billingMonth.split('-').map(Number)
    const issueDate = `${year}-${String(month).padStart(2, '0')}-05`

    const result = await createInvoice({
      accessToken: session.accessToken,
      contact,
      type: 'invoice',
      subject: `${sub.invoiceSubject}（${year}年${month}月分）`,
      items: [{
        date: `${year}/${month}/1`,
        description: sub.description,
        quantity: 1,
        unit: '式',
        unitPrice: record.amount,
      }],
      notes: '振込手数料はご負担お願いいたします。',
      issueDate,
      createDriveFolder: true,
    })

    // Update driveFolderId if new folder was created
    if (result.driveCreated && result.driveFolderId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { driveFolderId: result.driveFolderId },
      })
    }

    // Update billing record
    const updated = await prisma.billingRecord.update({
      where: { id },
      data: {
        status: 'GENERATED',
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        generatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, billingRecord: updated, invoice: result })
  } catch (error: unknown) {
    console.error('Invoice generation error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'

    // Record the error
    await prisma.billingRecord.update({
      where: { id },
      data: { errorMessage: msg },
    }).catch(() => {})

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
