import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('contactId')
  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  const contracts = await prisma.contract.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      templateName: true,
      status: true,
      sentAt: true,
      viewedAt: true,
      signedAt: true,
      signingToken: true,
    },
  })

  return NextResponse.json({ contracts })
}
