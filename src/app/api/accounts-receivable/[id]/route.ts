import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const body = await request.json()
    const { dueDate, status, notes, paidAmount, paidAt } = body

    const data: Record<string, unknown> = {}
    if (dueDate !== undefined) data.dueDate = new Date(dueDate)
    if (status !== undefined) data.status = status
    if (notes !== undefined) data.notes = notes
    if (paidAmount !== undefined) data.paidAmount = paidAmount
    if (paidAt !== undefined) data.paidAt = paidAt ? new Date(paidAt) : null

    // status が PAID のとき paidAt を自動設定
    if (status === 'PAID' && paidAt === undefined) {
      data.paidAt = new Date()
    }

    const updated = await prisma.accountsReceivable.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.accountsReceivable.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
