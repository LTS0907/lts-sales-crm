import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const data = await request.json()
  const exchange = await prisma.exchange.create({ data: { description: data.description, direction: data.direction, contactId: data.contactId } })
  return NextResponse.json(exchange)
}
