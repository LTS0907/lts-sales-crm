import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  return NextResponse.json(await prisma.group.findMany({ include: { GroupMember: { include: { Contact: true } } }, orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: NextRequest) {
  const data = await request.json()
  const group = await prisma.group.create({
    data: { id: crypto.randomUUID(), name: data.name, description: data.description, type: data.type || 'CUSTOM', GroupMember: data.contactIds ? { create: data.contactIds.map((id: string) => ({ contactId: id, consentGiven: true })) } : undefined },
    include: { GroupMember: { include: { Contact: true } } },
  })
  return NextResponse.json(group)
}
