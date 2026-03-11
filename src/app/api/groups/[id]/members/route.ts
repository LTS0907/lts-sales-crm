import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await request.json()
  const member = await prisma.groupMember.create({ data: { groupId: id, contactId: data.contactId, consentGiven: data.consentGiven || false } })
  return NextResponse.json(member)
}
