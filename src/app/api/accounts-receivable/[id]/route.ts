import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveStatusFromPayment } from '@/lib/accounts-receivable'

interface PatchBody {
  dueDate?: string | null
  status?: string
  notes?: string | null
  paidAmount?: number
  paidAt?: string | null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const body: PatchBody = await request.json()

    // 既存ARを取得（自動判定の判断材料）
    const existing = await prisma.accountsReceivable.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'AR not found' }, { status: 404 })
    }

    // ホワイトリスト方式で更新フィールドを構築
    const data: Record<string, unknown> = {}

    if (body.dueDate !== undefined) {
      const d = body.dueDate ? new Date(body.dueDate) : null
      if (d && isNaN(d.getTime())) {
        return NextResponse.json({ error: 'invalid dueDate' }, { status: 400 })
      }
      if (d) data.dueDate = d
    }

    if (body.notes !== undefined) data.notes = body.notes

    // paidAmount の更新
    let nextPaidAmount = existing.paidAmount
    if (body.paidAmount !== undefined) {
      if (typeof body.paidAmount !== 'number' || body.paidAmount < 0) {
        return NextResponse.json({ error: 'invalid paidAmount' }, { status: 400 })
      }
      nextPaidAmount = body.paidAmount
      data.paidAmount = nextPaidAmount
    }

    // status の決定
    // 1. 明示的に指定があればそれを使う
    // 2. paidAmount が変わった場合は自動判定
    let nextStatus = existing.status
    if (body.status !== undefined) {
      const allowedStatus = ['OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'WRITTEN_OFF']
      if (!allowedStatus.includes(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      }
      nextStatus = body.status
      // status=PAID 指定時、paidAmount が指定されてなければ全額入金扱い
      if (body.status === 'PAID' && body.paidAmount === undefined) {
        nextPaidAmount = existing.amount
        data.paidAmount = nextPaidAmount
      }
      data.status = nextStatus
    } else if (body.paidAmount !== undefined) {
      // paidAmount だけ更新時、status を自動判定
      nextStatus = deriveStatusFromPayment(existing.amount, nextPaidAmount, existing.status)
      data.status = nextStatus
    }

    // paidAt の決定
    if (body.paidAt !== undefined) {
      const d = body.paidAt ? new Date(body.paidAt) : null
      if (d && isNaN(d.getTime())) {
        return NextResponse.json({ error: 'invalid paidAt' }, { status: 400 })
      }
      data.paidAt = d
    } else if (nextStatus === 'PAID' && !existing.paidAt) {
      // PAID へ遷移したら自動で paidAt を今に設定
      data.paidAt = new Date()
    } else if (nextStatus !== 'PAID' && nextStatus !== 'PARTIAL' && existing.paidAt) {
      // 入金状態から戻ったら paidAt をクリア（ありえないが念のため）
      // 何もしない（履歴として残す）
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
