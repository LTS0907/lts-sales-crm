import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await prisma.contact.findUnique({ where: { id }, include: { Note: { orderBy: { createdAt: 'desc' } }, Exchange: { orderBy: { createdAt: 'desc' } }, MeetingParticipant: { include: { Meeting: true } }, GroupMember: { include: { Group: true } }, ServicePhase: true } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(contact)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await request.json()

  // salesPhase が変更される場合、phaseChangedAt を自動更新
  if (data.salesPhase) {
    const current = await prisma.contact.findUnique({ where: { id }, select: { salesPhase: true } })
    if (current && current.salesPhase !== data.salesPhase) {
      data.phaseChangedAt = new Date()
    }
  }

  const contact = await prisma.contact.update({ where: { id }, data })
  return NextResponse.json({ contact })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.contact.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
