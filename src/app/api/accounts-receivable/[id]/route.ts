import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveStatusFromPayment } from '@/lib/accounts-receivable'

interface PatchBody {
  dueDate?: string | null
  status?: string
  notes?: string | null
  paidAmount?: number
  paidAt?: string | null
  amount?: number
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

    // amount の更新（税込合計を直接書き換え、subtotal/taxAmount を 10% 税で再計算）
    let nextAmount = existing.amount
    let nextSubtotal = existing.subtotal
    let nextTaxAmount = existing.taxAmount
    if (body.amount !== undefined) {
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
        return NextResponse.json({ error: 'invalid amount' }, { status: 400 })
      }
      nextAmount = Math.round(body.amount)
      nextSubtotal = Math.floor(nextAmount / 1.1)
      nextTaxAmount = nextAmount - nextSubtotal
      data.amount = nextAmount
      data.subtotal = nextSubtotal
      data.taxAmount = nextTaxAmount
    }

    // paidAmount の更新
    let nextPaidAmount = existing.paidAmount
    if (body.paidAmount !== undefined) {
      if (typeof body.paidAmount !== 'number' || body.paidAmount < 0) {
        return NextResponse.json({ error: 'invalid paidAmount' }, { status: 400 })
      }
      nextPaidAmount = body.paidAmount
      data.paidAmount = nextPaidAmount
    }

    // 新amount < 既存paidAmount の場合はエラー（矛盾を防ぐ）
    if (nextAmount < nextPaidAmount) {
      return NextResponse.json({
        error: `金額(${nextAmount.toLocaleString()}円)が入金済額(${nextPaidAmount.toLocaleString()}円)を下回ります。入金済額を先に調整してください。`
      }, { status: 400 })
    }

    // status の決定
    // 1. 明示的に指定があればそれを使う
    // 2. paidAmount か amount が変わった場合は自動判定
    let nextStatus = existing.status
    if (body.status !== undefined) {
      const allowedStatus = ['OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'WRITTEN_OFF']
      if (!allowedStatus.includes(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      }
      nextStatus = body.status
      // status=PAID 指定時、paidAmount が指定されてなければ全額入金扱い
      if (body.status === 'PAID' && body.paidAmount === undefined) {
        nextPaidAmount = nextAmount
        data.paidAmount = nextPaidAmount
      }
      data.status = nextStatus
    } else if (body.paidAmount !== undefined || body.amount !== undefined) {
      // paidAmount または amount 更新時は status を自動判定
      nextStatus = deriveStatusFromPayment(nextAmount, nextPaidAmount, existing.status)
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
    }

    // amount 更新時は Revenue（売上）も連動更新する必要がある
    // → トランザクションでまとめて処理
    const updated = await prisma.$transaction(async (tx) => {
      const ar = await tx.accountsReceivable.update({ where: { id }, data })
      if (body.amount !== undefined) {
        await tx.revenue.updateMany({
          where: { accountsReceivableId: id },
          data: {
            subtotal: nextSubtotal,
            taxAmount: nextTaxAmount,
            totalAmount: nextAmount,
          },
        })
      }
      return ar
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
