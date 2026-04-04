import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { contractId } = await request.json()
    if (!contractId) {
      return NextResponse.json({ error: 'contractId is required' }, { status: 400 })
    }

    await prisma.contract.delete({ where: { id: contractId } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Contract delete error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
