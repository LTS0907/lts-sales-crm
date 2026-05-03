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
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      location: true,
      meetUrl: true,
      htmlLink: true,
      minutesUrl: true,
      minutesSummary: true,
      minutesActionItems: true,
      minutesTasksRegisteredAt: true,
      assigneeStaffId: true,
      status: true,
      owner: true,
      MeetingParticipant: {
        include: { Contact: { select: { id: true, name: true } } },
      },
    },
  })
  return NextResponse.json(meetings)
}
