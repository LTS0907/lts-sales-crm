import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year'); const month = searchParams.get('month')
  const meetings = await prisma.meeting.findMany({
    where: year && month ? { date: { gte: new Date(+year, +month - 1, 1), lte: new Date(+year, +month, 0, 23, 59, 59) } } : undefined,
    include: { participants: { include: { contact: true } } }, orderBy: { date: 'asc' },
  })
  return NextResponse.json(meetings)
}

export async function POST(request: NextRequest) {
  const data = await request.json()
  const meeting = await prisma.meeting.create({
    data: { title: data.title, date: new Date(data.date), location: data.location, notes: data.notes, participants: { create: (data.contactIds || []).map((id: string) => ({ contactId: id })) } },
    include: { participants: { include: { contact: true } } },
  })
  return NextResponse.json(meeting)
}
