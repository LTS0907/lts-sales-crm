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

interface ContactOption {
  id: string
  name: string
  company: string | null
}

function calcDefaultDueDate(invoicedAt: string): string {
  const d = new Date(invoicedAt)
  const due = new Date(d.getFullYear(), d.getMonth() + 2, 0)
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
}

export default function ReceivablesList({ items: initialItems, contacts }: { items: AR[]; contacts: ContactOption[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState('UNPAID')
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // フォーム状態
  const [contactSearch, setContactSearch] = useState('')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null)
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [serviceName, setServiceName] = useState('')
  const [invoiceSubject, setInvoiceSubject] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [invoicedAt, setInvoicedAt] = useState(todayStr)
  const [dueDate, setDueDate] = useState(calcDefaultDueDate(todayStr))
  const [notes, setNotes] = useState('')
  const [paidAmountStr, setPaidAmountStr] = useState('')

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase().trim()
    if (!q) return contacts.slice(0, 20)
    return contacts
      .filter(c => c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [contacts, contactSearch])

  function resetForm() {
    setSelectedContact(null)
    setContactSearch('')
    setServiceName('')
    setInvoiceSubject('')
    setAmountStr('')
    setInvoicedAt(todayStr)
    setDueDate(calcDefaultDueDate(todayStr))
    setNotes('')
    setPaidAmountStr('')
    setFormError('')
  }

  function handleInvoicedAtChange(v: string) {
    setInvoicedAt(v)
    // 期日も連動して更新（手で変えてないなら）
    if (v) setDueDate(calcDefaultDueDate(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!selectedContact) { setFormError('顧客を選択してください'); return }
    if (!serviceName.trim()) { setFormError('件名を入力してください'); return }
    const amount = parseInt(amountStr)
    if (!amount || amount <= 0) { setFormError('金額を正しく入力してください'); return }
    const paidAmount = paidAmountStr ? parseInt(paidAmountStr) : 0
    if (paidAmount < 0 || paidAmount > amount) { setFormError('入金額が不正です'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/accounts-receivable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.id,
          serviceName: serviceName.trim(),
          invoiceSubject: invoiceSubject.trim() || serviceName.trim(),
          amount,
          invoicedAt,
          dueDate,
          notes: notes.trim() || undefined,
          paidAmount: paidAmount > 0 ? paidAmount : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '登録に失敗しました')
      }
      const created = await res.json()
      // ローカル state に追加
      setItems([
        {
          ...created,
          invoicedAt: typeof created.invoicedAt === 'string' ? created.invoicedAt : new Date(created.invoicedAt).toISOString(),
          dueDate: typeof created.dueDate === 'string' ? created.dueDate : new Date(created.dueDate).toISOString(),
          paidAt: created.paidAt ? (typeof created.paidAt === 'string' ? created.paidAt : new Date(created.paidAt).toISOString()) : null,
          Contact: selectedContact,
        },
        ...items,
      ])
      setShowForm(false)
      resetForm()
      router.refresh()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : '登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [editingDueValue, setEditingDueValue] = useState('')
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [editingAmountValue, setEditingAmountValue] = useState('')
  const [editError, setEditError] = useState('')

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

  function startEditingAmount(ar: AR) {
    setEditingAmountId(ar.id)
    setEditingAmountValue(String(ar.amount))
    setEditError('')
  }

  async function handleAmountSave(arId: string) {
    const amount = parseInt(editingAmountValue)
    if (!amount || amount <= 0) {
      setEditError('金額を正しく入力してください')
      return
    }
    setEditError('')
    const res = await fetch(`/api/accounts-receivable/${arId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems(items.map(i => i.id === arId ? {
        ...i,
        amount: updated.amount,
        status: updated.status,
        paidAmount: updated.paidAmount,
      } : i))
      setEditingAmountId(null)
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({ error: '更新に失敗しました' }))
      setEditError(err.error || '更新に失敗しました')
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <p className="text-xs text-gray-500">未収残高</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-700 mt-1 tabular-nums">¥{summary.unpaidAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.unpaidCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <p className="text-xs text-gray-500">期日超過</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1 tabular-nums">¥{summary.overdueAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.overdueCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <p className="text-xs text-gray-500">入金済み（累計）</p>
          <p className="text-xl sm:text-2xl font-bold text-green-600 mt-1 tabular-nums">¥{summary.paidAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.paidCount}件</p>
        </div>
      </div>

      {/* Add button + Filter tabs */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
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
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm() }}
          className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-colors ${
            showForm
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {showForm ? 'キャンセル' : '+ 手動追加'}
        </button>
      </div>

      {/* Manual Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-blue-900">売掛金を手動追加</h3>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{formError}</div>
          )}

          {/* 顧客選択 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">顧客 <span className="text-red-500">*</span></label>
            {selectedContact ? (
              <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-blue-200">
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedContact.company || selectedContact.name}</p>
                  {selectedContact.company && <p className="text-xs text-gray-500">{selectedContact.name}</p>}
                </div>
                <button type="button" onClick={() => { setSelectedContact(null); setContactSearch('') }}
                  className="text-xs text-red-500 hover:underline">変更</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); setShowContactDropdown(true) }}
                  onFocus={() => setShowContactDropdown(true)}
                  placeholder="会社名・氏名で検索..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
                {showContactDropdown && filteredContacts.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { setSelectedContact(c); setShowContactDropdown(false); setContactSearch('') }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                        <span className="font-medium">{c.company || c.name}</span>
                        {c.company && <span className="text-gray-500 ml-2 text-xs">{c.name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 件名・金額 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">件名 <span className="text-red-500">*</span></label>
              <input type="text" value={serviceName} onChange={e => setServiceName(e.target.value)}
                placeholder="例: IT内製化サポート 4月分"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">金額（税込） <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">¥</span>
                <input type="number" value={amountStr} onChange={e => setAmountStr(e.target.value)}
                  placeholder="165000"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
            </div>
          </div>

          {/* 請求日・支払期日 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">請求日</label>
              <input type="date" value={invoicedAt} onChange={e => handleInvoicedAtChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">支払期日（デフォ翌月末）</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
          </div>

          {/* 入金額（既に入金済みなら）・備考 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">入金済み額（任意）</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">¥</span>
                <input type="number" value={paidAmountStr} onChange={e => setPaidAmountStr(e.target.value)}
                  placeholder="0"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">満額入力で自動的に「入金済み」に</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="内部メモ"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              キャンセル
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
      )}

      {/* List (PC: テーブル) */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {editingAmountId === ar.id ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">¥</span>
                            <input
                              type="number"
                              value={editingAmountValue}
                              onChange={e => setEditingAmountValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleAmountSave(ar.id)
                                if (e.key === 'Escape') { setEditingAmountId(null); setEditError('') }
                              }}
                              autoFocus
                              className="border border-gray-300 rounded px-2 py-0.5 text-xs w-28 text-right"
                            />
                            <button onClick={() => handleAmountSave(ar.id)}
                              className="text-xs text-blue-600 hover:underline">保存</button>
                            <button onClick={() => { setEditingAmountId(null); setEditError('') }}
                              className="text-xs text-gray-400 hover:underline">取消</button>
                          </div>
                          {editError && <p className="text-[10px] text-red-600">{editError}</p>}
                        </div>
                      ) : (
                        <button onClick={() => startEditingAmount(ar)}
                          className="text-gray-900 hover:text-blue-600 hover:underline cursor-pointer">
                          ¥{ar.amount.toLocaleString()}
                        </button>
                      )}
                    </td>
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

      {/* List (スマホ・iPad: カード) */}
      <div className="lg:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">該当する売掛金はありません</div>
        ) : (
          filtered.map(ar => {
            const meta = STATUS_META[ar.status] || { label: ar.status, color: 'bg-gray-100 text-gray-600' }
            const remaining = ar.amount - ar.paidAmount
            return (
              <div key={ar.id} className="bg-white rounded-xl border border-gray-200 p-4">
                {/* ヘッダー: 顧客 + 状態 */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link href={`/contacts/${ar.contactId}`} className="flex-1 min-w-0 text-blue-600 hover:underline">
                    <p className="text-sm font-medium truncate">{ar.Contact.company || ar.Contact.name}</p>
                    {ar.Contact.company && <p className="text-xs text-gray-400 truncate">{ar.Contact.name}</p>}
                  </Link>
                  <span className={`flex-shrink-0 inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>

                {/* 件名 */}
                <div className="text-sm text-gray-700 mb-2">
                  {ar.spreadsheetUrl ? (
                    <a href={ar.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                      className="hover:text-blue-600 hover:underline">
                      {ar.invoiceSubject || ar.serviceName}
                    </a>
                  ) : (
                    ar.invoiceSubject || ar.serviceName
                  )}
                </div>

                {/* 金額・入金 */}
                <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
                  <div>
                    <p className="text-[10px] text-gray-500">金額</p>
                    {editingAmountId === ar.id ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">¥</span>
                          <input
                            type="number"
                            value={editingAmountValue}
                            onChange={e => setEditingAmountValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAmountSave(ar.id)
                              if (e.key === 'Escape') { setEditingAmountId(null); setEditError('') }
                            }}
                            autoFocus
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs w-24"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAmountSave(ar.id)} className="text-xs text-blue-600">保存</button>
                          <button onClick={() => { setEditingAmountId(null); setEditError('') }} className="text-xs text-gray-400">取消</button>
                        </div>
                        {editError && <p className="text-[10px] text-red-600">{editError}</p>}
                      </div>
                    ) : (
                      <button onClick={() => startEditingAmount(ar)} className="font-medium text-gray-900 tabular-nums hover:underline">
                        ¥{ar.amount.toLocaleString()}
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">入金済</p>
                    {ar.paidAmount > 0 ? (
                      <div>
                        <p className="text-green-600 tabular-nums">¥{ar.paidAmount.toLocaleString()}</p>
                        {remaining > 0 && <p className="text-[10px] text-red-500 tabular-nums">残 ¥{remaining.toLocaleString()}</p>}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </div>

                {/* 日付 */}
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                  <div>
                    <span className="text-[10px]">請求日: </span>
                    <span>{fmtDate(ar.invoicedAt)}</span>
                  </div>
                  <div>
                    <span className="text-[10px]">期日: </span>
                    {editingDueId === ar.id ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input type="date" value={editingDueValue}
                          onChange={e => setEditingDueValue(e.target.value)}
                          className="border border-gray-300 rounded px-1 py-0.5 text-xs" />
                        <button onClick={() => handleDueDateSave(ar.id)} className="text-blue-600">保存</button>
                        <button onClick={() => setEditingDueId(null)} className="text-gray-400">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => startEditingDue(ar)} className="hover:text-blue-600 hover:underline">
                        {fmtDate(ar.dueDate)}
                      </button>
                    )}
                  </div>
                </div>

                {/* 操作ボタン */}
                {ar.status !== 'PAID' && ar.status !== 'WRITTEN_OFF' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleStatusChange(ar, 'PAID')}
                      className="flex-1 text-xs px-3 py-1.5 border border-green-300 text-green-700 rounded hover:bg-green-50">
                      入金済に
                    </button>
                    <button onClick={() => handleStatusChange(ar, 'WRITTEN_OFF')}
                      className="flex-1 text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded hover:bg-gray-50">
                      貸倒
                    </button>
                  </div>
                )}
                {ar.status === 'PAID' && ar.paidAt && (
                  <p className="text-xs text-gray-400 text-right">入金日: {fmtDate(ar.paidAt)}</p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
