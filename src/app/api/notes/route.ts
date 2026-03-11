import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const data = await request.json()
  const note = await prisma.note.create({ data: { content: data.content, category: data.category || 'GENERAL', contactId: data.contactId } })
  return NextResponse.json(note)
}
