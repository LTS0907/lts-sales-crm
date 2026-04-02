import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  try {
    const body = await request.json()
    const { amount, status, sentMethod } = body

    const data: Record<string, unknown> = {}

    // Set amount and confirm
    if (amount !== undefined) {
      data.amount = amount
      data.amountConfirmed = true
    }

    // Update status
    if (status) {
      data.status = status
      if (status === 'SENT' || status === 'DOWNLOADED') {
        data.sentAt = new Date()
        data.sentMethod = sentMethod || (status === 'SENT' ? 'EMAIL' : 'PDF_DOWNLOAD')
      }
    }

    const record = await prisma.billingRecord.update({
      where: { id },
      data,
      include: {
        Subscription: {
          include: {
            Contact: { select: { id: true, name: true, company: true } },
          },
        },
      },
    })

    return NextResponse.json(record)
  } catch (error: unknown) {
    console.error('Billing record update error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
