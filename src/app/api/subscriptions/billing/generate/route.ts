import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { createInvoice } from '@/lib/invoice'
import { createReceivableWithRevenue } from '@/lib/accounts-receivable'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { month } = body // "2026-04"

    if (!month) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 })
    }

    // Find all confirmed but not yet generated records for this month
    const records = await prisma.billingRecord.findMany({
      where: {
        billingMonth: month,
        amountConfirmed: true,
        status: 'PENDING',
      },
      include: {
        Subscription: {
          include: {
            Contact: { select: { id: true, name: true, company: true, email: true, driveFolderId: true } },
          },
        },
      },
    })

    const results: { id: string; success: boolean; error?: string }[] = []
    const [year, monthNum] = month.split('-').map(Number)

    for (const record of records) {
      try {
        const sub = record.Subscription
        const contact = sub.Contact
        const issueDate = `${year}-${String(monthNum).padStart(2, '0')}-05`

        const result = await createInvoice({
          accessToken: session.accessToken,
          contact,
          type: 'invoice',
          subject: `${sub.invoiceSubject}（${year}年${monthNum}月分）`,
          items: [{
            date: `${year}/${monthNum}/1`,
            description: sub.description,
            quantity: 1,
            unit: '式',
            unitPrice: record.amount!,
          }],
          notes: '振込手数料はご負担お願いいたします。',
          issueDate,
          createDriveFolder: true,
        })

        if (result.driveCreated && result.driveFolderId) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { driveFolderId: result.driveFolderId },
          })
        }

        // BillingRecord更新 + AR/Revenue 自動計上をアトミックに
        await prisma.$transaction(async (tx) => {
          await tx.billingRecord.update({
            where: { id: record.id },
            data: {
              status: 'GENERATED',
              spreadsheetId: result.spreadsheetId,
              spreadsheetUrl: result.spreadsheetUrl,
              generatedAt: new Date(),
            },
          })

          await createReceivableWithRevenue(
            {
              contactId: contact.id,
              billingRecordId: record.id,
              source: 'SUBSCRIPTION',
              serviceName: sub.serviceName,
              invoiceSubject: sub.invoiceSubject,
              spreadsheetId: result.spreadsheetId,
              spreadsheetUrl: result.spreadsheetUrl,
              amount: record.amount!,
              invoicedAt: new Date(issueDate),
            },
            tx
          )
        })

        results.push({ id: record.id, success: true })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await prisma.billingRecord.update({
          where: { id: record.id },
          data: { errorMessage: msg },
        }).catch(() => {})
        results.push({ id: record.id, success: false, error: msg })
      }
    }

    const successCount = results.filter(r => r.success).length
    return NextResponse.json({
      total: records.length,
      success: successCount,
      failed: records.length - successCount,
      results,
    })
  } catch (error: unknown) {
    console.error('Batch generate error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
