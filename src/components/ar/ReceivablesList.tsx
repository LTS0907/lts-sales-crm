'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface AR {
  id: string
  contactId: string
  serviceName: string
  invoiceSubject: string | null
  spreadsheetUrl: string | null
  amount: number
  paidAmount: number
  invoicedAt: string
  dueDate: string
  paidAt: string | null
  status: string
  notes: string | null
  source: string
  Contact: { id: string; name: string; company: string | null }
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN:        { label: '未収',     color: 'bg-blue-100 text-blue-700' },
  PARTIAL:     { label: '一部入金', color: 'bg-yellow-100 text-yellow-700' },
  PAID:        { label: '入金済み', color: 'bg-green-100 text-green-700' },
  OVERDUE:     { label: '期日超過', color: 'bg-red-100 text-red-700' },
  WRITTEN_OFF: { label: '貸倒',     color: 'bg-gray-100 text-gray-500' },
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'UNPAID',      label: '未収・一部入金・期日超過' },
  { key: 'OPEN',        label: '未収' },
  { key: 'PARTIAL',     label: '一部入金' },
  { key: 'OVERDUE',     label: '期日超過' },
  { key: 'PAID',        label: '入金済み' },
  { key: 'WRITTEN_OFF', label: '貸倒' },
  { key: 'ALL',         label: 'すべて' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function ReceivablesList({ items: initialItems }: { items: AR[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState('UNPAID')
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [editingDueValue, setEditingDueValue] = useState('')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return items
    if (filter === 'UNPAID') return items.filter(i => ['OPEN', 'PARTIAL', 'OVERDUE'].includes(i.status))
    return items.filter(i => i.status === filter)
  }, [items, filter])

  const summary = useMemo(() => {
    const unpaid = items.filter(i => ['OPEN', 'PARTIAL', 'OVERDUE'].includes(i.status))
    const overdue = items.filter(i => i.status === 'OVERDUE')
    const paid = items.filter(i => i.status === 'PAID')
    return {
      unpaidAmount: unpaid.reduce((s, i) => s + (i.amount - i.paidAmount), 0),
      unpaidCount: unpaid.length,
      overdueAmount: overdue.reduce((s, i) => s + (i.amount - i.paidAmount), 0),
      overdueCount: overdue.length,
      paidAmount: paid.reduce((s, i) => s + i.amount, 0),
      paidCount: paid.length,
    }
  }, [items])

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
      setItems(items.map(i => i.id === ar.id ? {
        ...i,
        status: updated.status,
        paidAmount: updated.paidAmount,
        paidAt: updated.paidAt,
      } : i))
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

  function startEditingDue(ar: AR) {
    setEditingDueId(ar.id)
    setEditingDueValue(ar.dueDate.slice(0, 10))
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">未収残高</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">¥{summary.unpaidAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.unpaidCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">期日超過</p>
          <p className="text-2xl font-bold text-red-600 mt-1">¥{summary.overdueAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.overdueCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">入金済み（累計）</p>
          <p className="text-2xl font-bold text-green-600 mt-1">¥{summary.paidAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.paidCount}件</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filter === f.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">該当する売掛金はありません</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left px-4 py-2 font-medium">顧客</th>
                <th className="text-left px-4 py-2 font-medium">件名</th>
                <th className="text-right px-4 py-2 font-medium">金額</th>
                <th className="text-right px-4 py-2 font-medium">入金済</th>
                <th className="text-left px-4 py-2 font-medium">請求日</th>
                <th className="text-left px-4 py-2 font-medium">支払期日</th>
                <th className="text-left px-4 py-2 font-medium">状態</th>
                <th className="text-right px-4 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ar => {
                const meta = STATUS_META[ar.status] || { label: ar.status, color: 'bg-gray-100 text-gray-600' }
                const remaining = ar.amount - ar.paidAmount
                return (
                  <tr key={ar.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/contacts/${ar.contactId}`} className="text-blue-600 hover:underline font-medium">
                        {ar.Contact.company || ar.Contact.name}
                      </Link>
                      {ar.Contact.company && <p className="text-xs text-gray-400">{ar.Contact.name}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {ar.spreadsheetUrl ? (
                        <a href={ar.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                          className="text-gray-800 hover:text-blue-600 hover:underline">
                          {ar.invoiceSubject || ar.serviceName}
                        </a>
                      ) : (
                        <span className="text-gray-800">{ar.invoiceSubject || ar.serviceName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">¥{ar.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {ar.paidAmount > 0 ? (
                        <div>
                          <p className="text-green-600">¥{ar.paidAmount.toLocaleString()}</p>
                          {remaining > 0 && <p className="text-xs text-red-500">残 ¥{remaining.toLocaleString()}</p>}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(ar.invoicedAt)}</td>
                    <td className="px-4 py-3 text-xs">
                      {editingDueId === ar.id ? (
                        <div className="flex items-center gap-1">
                          <input type="date" value={editingDueValue}
                            onChange={e => setEditingDueValue(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs" />
                          <button onClick={() => handleDueDateSave(ar.id)}
                            className="text-blue-600 hover:underline">保存</button>
                          <button onClick={() => setEditingDueId(null)}
                            className="text-gray-400 hover:underline">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => startEditingDue(ar)}
                          className="text-gray-500 hover:text-blue-600 hover:underline">
                          {fmtDate(ar.dueDate)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ar.status !== 'PAID' && ar.status !== 'WRITTEN_OFF' && (
                        <div className="flex gap-1 justify-end">
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
                      {ar.status === 'PAID' && ar.paidAt && (
                        <p className="text-[10px] text-gray-400">{fmtDate(ar.paidAt)}</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
