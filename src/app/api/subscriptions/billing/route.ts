import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // "2026-04"
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (month) where.billingMonth = month
  if (status) where.status = status

  const records = await prisma.billingRecord.findMany({
    where,
    include: {
      Subscription: {
        include: {
          Contact: { select: { id: true, name: true, company: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(records)
}
