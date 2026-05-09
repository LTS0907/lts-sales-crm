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
    const {
      serviceName,
      billingType,
      billingCycle,
      fixedAmount,
      description,
      invoiceSubject,
      startDate,
      endDate,
      status,
      notes,
    } = body

    // enum バリデーション
    if (billingType !== undefined && !['FIXED', 'VARIABLE'].includes(billingType)) {
      return NextResponse.json({ error: 'Invalid billingType' }, { status: 400 })
    }
    if (billingCycle !== undefined && !['MONTHLY', 'YEARLY'].includes(billingCycle)) {
      return NextResponse.json({ error: 'Invalid billingCycle' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}

    if (serviceName !== undefined) data.serviceName = serviceName
    if (description !== undefined) data.description = description
    if (invoiceSubject !== undefined) data.invoiceSubject = invoiceSubject
    if (notes !== undefined) data.notes = notes

    // billingType の変更: VARIABLE に変更した場合は fixedAmount を null にする
    if (billingType !== undefined) {
      data.billingType = billingType
      if (billingType === 'VARIABLE') {
        data.fixedAmount = null
      }
    }

    if (billingCycle !== undefined) data.billingCycle = billingCycle

    // fixedAmount: billingType が VARIABLE でない場合のみ受け付ける
    if (fixedAmount !== undefined && billingType !== 'VARIABLE') {
      data.fixedAmount = fixedAmount === null ? null : Number(fixedAmount)
    }

    // 日付の変更: JST midnight → UTC のズレを防ぐため +09:00 を付加
    if (startDate !== undefined) {
      data.startDate = new Date(startDate + 'T00:00:00+09:00')
    }
    // endDate は null（クリア）も明示的に処理する
    if ('endDate' in body) {
      data.endDate = endDate ? new Date(endDate + 'T00:00:00+09:00') : null
    }

    // status 変更（一時停止 / 解約 / 再開）— cancelledAt / endDate は status 変更時のみ
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
        Contact: { select: { id: true, name: true, company: true, email: true } },
      },
    })

    return NextResponse.json(subscription)
  } catch (error: unknown) {
    console.error('Subscription update error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
