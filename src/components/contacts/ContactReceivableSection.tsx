'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RevenueByYearTable from '@/components/revenue/RevenueByYearTable'

interface RevenueRow {
  fiscalMonth: string
  totalAmount: number
}

interface AR {
  id: string
  serviceName: string
  invoiceSubject: string | null
  spreadsheetUrl: string | null
  amount: number
  paidAmount: number
  invoicedAt: string | Date
  dueDate: string | Date
  paidAt: string | Date | null
  status: string
  notes: string | null
  source: string
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN:        { label: '未収',     color: 'bg-blue-100 text-blue-700' },
  PARTIAL:     { label: '一部入金', color: 'bg-yellow-100 text-yellow-700' },
  PAID:        { label: '入金済み', color: 'bg-green-100 text-green-700' },
  OVERDUE:     { label: '期日超過', color: 'bg-red-100 text-red-700' },
  WRITTEN_OFF: { label: '貸倒',     color: 'bg-gray-100 text-gray-500' },
}

function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function toDateInput(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function ContactReceivableSection({
  contactId: _contactId,
  receivables: initialItems,
  revenues = [],
}: {
  contactId: string
  receivables: AR[]
  revenues?: RevenueRow[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [editingDueValue, setEditingDueValue] = useState('')

  const unpaid = items.filter(i => ['OPEN', 'PARTIAL', 'OVERDUE'].includes(i.status))
  const paid = items.filter(i => i.status === 'PAID')
  const unpaidAmount = unpaid.reduce((s, i) => s + (i.amount - i.paidAmount), 0)
  const paidTotal = paid.reduce((s, i) => s + i.amount, 0)

  async function handleStatusChange(ar: AR, newStatus: string) {
    const res = await fetch(`/api/accounts-receivable/${ar.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        ...(newStatus === 'PAID' ? { paidAmount: ar.amount, paidAt: new Date().toISOString() } : {}),
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems(items.map(i => i.id === ar.id ? { ...i, status: updated.status, paidAmount: updated.paidAmount, paidAt: updated.paidAt } : i))
      router.refresh()
    }
  }

  async function handleDueDateSave(arId: string) {
    if (!editingDueValue) { setEditingDueId(null); return }
    const res = await fetch(`/api/accounts-receivable/${arId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: editingDueValue }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems(items.map(i => i.id === arId ? { ...i, dueDate: updated.dueDate, status: updated.status } : i))
      setEditingDueId(null)
      router.refresh()
    }
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {revenues.length > 0 && (
          <RevenueByYearTable rows={revenues} title="この顧客の売上" />
        )}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-500">売掛金はまだありません</p>
          <p className="text-xs text-gray-400 mt-1">請求書を発行すると自動で登録されます</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 売上集計 */}
      {revenues.length > 0 && (
        <RevenueByYearTable rows={revenues} title="この顧客の売上" />
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">未収残高</p>
          <p className="text-xl font-bold text-blue-700 mt-1">¥{unpaidAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">{unpaid.length}件</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">入金済み（累計）</p>
          <p className="text-xl font-bold text-green-600 mt-1">¥{paidTotal.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">{paid.length}件</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {items.map(ar => {
          const meta = STATUS_META[ar.status] || { label: ar.status, color: 'bg-gray-100 text-gray-600' }
          const remaining = ar.amount - ar.paidAmount
          return (
            <div key={ar.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ar.spreadsheetUrl ? (
                      <a href={ar.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-bold text-gray-900 hover:text-blue-600 hover:underline truncate">
                        {ar.invoiceSubject || ar.serviceName}
                      </a>
                    ) : (
                      <span className="text-sm font-bold text-gray-900 truncate">{ar.invoiceSubject || ar.serviceName}</span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {ar.source === 'SUBSCRIPTION' ? 'サブスク' : '単発'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                    <span className="font-bold text-base text-gray-900">¥{ar.amount.toLocaleString()}</span>
                    {ar.paidAmount > 0 && (
                      <span className="text-green-600">入金 ¥{ar.paidAmount.toLocaleString()}</span>
                    )}
                    {remaining > 0 && ar.paidAmount > 0 && (
                      <span className="text-red-500">残 ¥{remaining.toLocaleString()}</span>
                    )}
                    <span>請求日: {fmtDate(ar.invoicedAt)}</span>
                    <span className="flex items-center gap-1">
                      期日:
                      {editingDueId === ar.id ? (
                        <>
                          <input type="date" value={editingDueValue}
                            onChange={e => setEditingDueValue(e.target.value)}
                            className="border border-gray-300 rounded px-1 py-0 text-xs" />
                          <button onClick={() => handleDueDateSave(ar.id)}
                            className="text-blue-600 hover:underline">保存</button>
                          <button onClick={() => setEditingDueId(null)}
                            className="text-gray-400">取消</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingDueId(ar.id); setEditingDueValue(toDateInput(ar.dueDate)) }}
                          className="text-gray-700 hover:text-blue-600 hover:underline">
                          {fmtDate(ar.dueDate)}
                        </button>
                      )}
                    </span>
                    {ar.paidAt && <span className="text-green-600">入金日: {fmtDate(ar.paidAt)}</span>}
                  </div>
                </div>

                {/* Actions */}
                {ar.status !== 'PAID' && ar.status !== 'WRITTEN_OFF' && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => handleStatusChange(ar, 'PAID')}
                      className="text-[10px] px-2 py-1 border border-green-300 text-green-700 rounded hover:bg-green-50">
                      入金済に
                    </button>
                    <button onClick={() => handleStatusChange(ar, 'WRITTEN_OFF')}
                      className="text-[10px] px-2 py-1 border border-gray-300 text-gray-500 rounded hover:bg-gray-50">
                      貸倒
                    </button>
                  </div>
                )}
              </div>

              {ar.notes && (
                <p className="mt-2 text-xs text-gray-400 bg-gray-50 p-1.5 rounded">{ar.notes}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
