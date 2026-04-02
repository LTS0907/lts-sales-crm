import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Find active VARIABLE subscriptions that need amount input
    const variableSubs = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        billingType: 'VARIABLE',
        startDate: { lte: firstOfMonth },
        OR: [
          { endDate: null },
          { endDate: { gte: firstOfMonth } },
        ],
      },
      include: {
        Contact: { select: { name: true, company: true } },
      },
    })

    let created = 0
    let skipped = 0

    for (const sub of variableSubs) {
      // Check if billing record already exists (could have been created early)
      const existing = await prisma.billingRecord.findUnique({
        where: { subscriptionId_billingMonth: { subscriptionId: sub.id, billingMonth } },
      })

      if (existing) {
        skipped++
        continue
      }

      // Pre-create billing record with amount=null for the user to fill in
      await prisma.billingRecord.create({
        data: {
          subscriptionId: sub.id,
          billingMonth,
          amount: null,
          amountConfirmed: false,
        },
      })
      created++
    }

    return NextResponse.json({
      billingMonth,
      variableSubscriptions: variableSubs.length,
      recordsCreated: created,
      recordsSkipped: skipped,
    })
  } catch (error: unknown) {
    console.error('Remind cron error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
