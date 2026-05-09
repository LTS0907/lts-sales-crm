import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { createInvoice } from '@/lib/invoice'
import { createReceivableWithRevenue } from '@/lib/accounts-receivable'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { month, amount: bodyAmount } = body as { month?: string; amount?: number }

    // デフォルト: 今月 (JST)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const targetMonth = month ?? defaultMonth

    // YYYY-MM バリデーション
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 })
    }

    // サブスク + Contact 取得
    const sub = await prisma.subscription.findUnique({
      where: { id },
      include: {
        Contact: {
          select: { id: true, name: true, company: true, email: true, driveFolderId: true },
        },
      },
    })

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    // 発行金額を確定
    let amount: number
    if (sub.billingType === 'FIXED') {
      amount = sub.fixedAmount ?? 0
    } else {
      // VARIABLE: body.amount 必須
      if (bodyAmount == null || isNaN(bodyAmount)) {
        return NextResponse.json(
          { error: 'amount is required for VARIABLE subscriptions' },
          { status: 400 }
        )
      }
      amount = bodyAmount
    }

    // 既存 BillingRecord 確認
    const existingRecord = await prisma.billingRecord.findUnique({
      where: { subscriptionId_billingMonth: { subscriptionId: id, billingMonth: targetMonth } },
    })

    if (existingRecord?.status === 'GENERATED' || existingRecord?.status === 'SENT' || existingRecord?.status === 'DOWNLOADED') {
      return NextResponse.json(
        { error: 'すでに発行済みの請求書があります', status: existingRecord.status },
        { status: 409 }
      )
    }

    // BillingRecord を upsert (PENDING 状態で確定)
    const billingRecord = await prisma.billingRecord.upsert({
      where: { subscriptionId_billingMonth: { subscriptionId: id, billingMonth: targetMonth } },
      create: {
        subscriptionId: id,
        billingMonth: targetMonth,
        amount,
        amountConfirmed: true,
        status: 'PENDING',
      },
      update: {
        amount,
        amountConfirmed: true,
        status: 'PENDING',
      },
    })

    // 請求書を Drive に作成
    const [year, monthNum] = targetMonth.split('-').map(Number)
    const issueDate = `${year}-${String(monthNum).padStart(2, '0')}-05`
    const contact = sub.Contact

    const invoiceResult = await createInvoice({
      accessToken: session.accessToken,
      contact,
      type: 'invoice',
      subject: `${sub.invoiceSubject}（${year}年${monthNum}月分）`,
      items: [
        {
          date: `${year}/${monthNum}/1`,
          description: sub.description,
          quantity: 1,
          unit: '式',
          unitPrice: amount,
        },
      ],
      notes: '振込手数料はご負担お願いいたします。',
      issueDate,
      createDriveFolder: true,
    })

    // BillingRecord 更新 + AR/Revenue 計上をアトミックに
    const { accountsReceivable } = await prisma.$transaction(async (tx) => {
      // driveFolderId が新規作成された場合は Contact に保存
      if (invoiceResult.driveCreated && invoiceResult.driveFolderId) {
        await tx.contact.update({
          where: { id: contact.id },
          data: { driveFolderId: invoiceResult.driveFolderId },
        })
      }

      await tx.billingRecord.update({
        where: { id: billingRecord.id },
        data: {
          status: 'GENERATED',
          spreadsheetId: invoiceResult.spreadsheetId,
          spreadsheetUrl: invoiceResult.spreadsheetUrl,
          generatedAt: new Date(),
        },
      })

      const arResult = await createReceivableWithRevenue(
        {
          contactId: contact.id,
          billingRecordId: billingRecord.id,
          source: 'SUBSCRIPTION',
          serviceName: sub.serviceName,
          invoiceSubject: sub.invoiceSubject,
          spreadsheetId: invoiceResult.spreadsheetId,
          spreadsheetUrl: invoiceResult.spreadsheetUrl,
          amount,
          invoicedAt: new Date(issueDate),
        },
        tx
      )

      return arResult
    })

    return NextResponse.json({
      ok: true,
      billingRecordId: billingRecord.id,
      spreadsheetId: invoiceResult.spreadsheetId,
      spreadsheetUrl: invoiceResult.spreadsheetUrl,
      accountsReceivableId: accountsReceivable.id,
    })
  } catch (error: unknown) {
    console.error('Invoice generate error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
