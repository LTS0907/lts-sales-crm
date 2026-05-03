import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const meetings = await prisma.meeting.findMany({
    where: {
      MeetingParticipant: {
        some: { contactId: id },
      },
    },
    orderBy: { date: 'desc' },
    include: {
      MeetingParticipant: {
        include: { Contact: { select: { id: true, name: true } } },
      },
    },
  })
  return NextResponse.json(meetings)
}
