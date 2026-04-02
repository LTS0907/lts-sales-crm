import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const contactId = searchParams.get('contactId')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (contactId) where.contactId = contactId

  const subscriptions = await prisma.subscription.findMany({
    where,
    include: {
      Contact: { select: { id: true, name: true, company: true, email: true } },
      BillingRecord: { orderBy: { billingMonth: 'desc' }, take: 3 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(subscriptions)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const body = await request.json()
    const { contactId, serviceName, billingType, fixedAmount, description, invoiceSubject, startDate, notes } = body

    // Check for existing active subscription for same contact+service
    const existing = await prisma.subscription.findFirst({
      where: { contactId, serviceName, status: 'ACTIVE' },
    })
    if (existing) {
      return NextResponse.json(
        { error: `${serviceName}のアクティブなサブスクリプションが既に存在します` },
        { status: 400 }
      )
    }

    const subscription = await prisma.subscription.create({
      data: {
        contactId,
        serviceName,
        billingType,
        fixedAmount: billingType === 'FIXED' ? fixedAmount : null,
        description,
        invoiceSubject,
        startDate: new Date(startDate),
        notes,
      },
      include: {
        Contact: { select: { id: true, name: true, company: true } },
      },
    })

    return NextResponse.json(subscription, { status: 201 })
  } catch (error: unknown) {
    console.error('Subscription creation error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
