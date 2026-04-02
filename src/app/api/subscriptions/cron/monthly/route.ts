import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAccessToken } from '@/lib/google-auth'
import { createInvoice } from '@/lib/invoice'

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_API_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [year, monthNum] = billingMonth.split('-').map(Number)
    const firstOfMonth = new Date(year, monthNum - 1, 1)

    // Find all active subscriptions that should be billed this month
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: firstOfMonth },
        OR: [
          { endDate: null },
          { endDate: { gte: firstOfMonth } },
        ],
      },
      include: {
        Contact: { select: { id: true, name: true, company: true, email: true, driveFolderId: true } },
      },
    })

    let created = 0
    let skipped = 0
    let generated = 0
    let errors = 0
    let accessToken: string | null = null

    for (const sub of subscriptions) {
      // Idempotency: skip if record already exists
      const existing = await prisma.billingRecord.findUnique({
        where: { subscriptionId_billingMonth: { subscriptionId: sub.id, billingMonth } },
      })
      if (existing) {
        skipped++
        continue
      }

      const isFixed = sub.billingType === 'FIXED'

      // Create billing record
      const record = await prisma.billingRecord.create({
        data: {
          subscriptionId: sub.id,
          billingMonth,
          amount: isFixed ? sub.fixedAmount : null,
          amountConfirmed: isFixed,
        },
      })
      created++

      // Auto-generate invoice for FIXED subscriptions
      if (isFixed && sub.fixedAmount) {
        try {
          if (!accessToken) accessToken = await getAccessToken()

          const issueDate = `${year}-${String(monthNum).padStart(2, '0')}-05`
          const result = await createInvoice({
            accessToken,
            contact: sub.Contact,
            type: 'invoice',
            subject: `${sub.invoiceSubject}（${year}年${monthNum}月分）`,
            items: [{
              date: `${year}/${monthNum}/1`,
              description: sub.description,
              quantity: 1,
              unit: '式',
              unitPrice: sub.fixedAmount,
            }],
            notes: '振込手数料はご負担お願いいたします。',
            issueDate,
            createDriveFolder: true,
          })

          if (result.driveCreated && result.driveFolderId) {
            await prisma.contact.update({
              where: { id: sub.Contact.id },
              data: { driveFolderId: result.driveFolderId },
            })
          }

          await prisma.billingRecord.update({
            where: { id: record.id },
            data: {
              status: 'GENERATED',
              spreadsheetId: result.spreadsheetId,
              spreadsheetUrl: result.spreadsheetUrl,
              generatedAt: new Date(),
            },
          })
          generated++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          await prisma.billingRecord.update({
            where: { id: record.id },
            data: { errorMessage: msg },
          }).catch(() => {})
          errors++
        }
      }
    }

    return NextResponse.json({
      billingMonth,
      total: subscriptions.length,
      created,
      skipped,
      generated,
      errors,
    })
  } catch (error: unknown) {
    console.error('Monthly cron error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
