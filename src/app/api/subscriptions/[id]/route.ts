import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      Contact: { select: { id: true, name: true, company: true, email: true } },
      BillingRecord: { orderBy: { billingMonth: 'desc' } },
    },
  })

  if (!subscription) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  }

  return NextResponse.json(subscription)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  try {
    const body = await request.json()
    const { fixedAmount, description, invoiceSubject, status, notes } = body

    const data: Record<string, unknown> = {}
    if (fixedAmount !== undefined) data.fixedAmount = fixedAmount
    if (description !== undefined) data.description = description
    if (invoiceSubject !== undefined) data.invoiceSubject = invoiceSubject
    if (notes !== undefined) data.notes = notes

    if (status) {
      data.status = status
      if (status === 'CANCELLED') {
        data.cancelledAt = new Date()
        data.endDate = new Date()
      }
    }

    const subscription = await prisma.subscription.update({
      where: { id },
      data,
      include: {
        Contact: { select: { id: true, name: true, company: true } },
      },
    })

    return NextResponse.json(subscription)
  } catch (error: unknown) {
    console.error('Subscription update error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
