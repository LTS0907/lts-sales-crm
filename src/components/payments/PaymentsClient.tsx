'use client'

import { useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ARForMatching {
  id: string
  contactId: string
  serviceName: string
  invoiceSubject: string | null
  amount: number
  paidAmount: number
  invoicedAt: string
  dueDate: string
  status: string
  Contact: { id: string; name: string; nameKana: string | null; company: string | null }
}

interface Allocation {
  id: string
  accountsReceivableId: string
  allocatedAmount: number
  AccountsReceivable: {
    id: string
    serviceName: string
    amount: number
    paidAmount: number
    status: string
    Contact: { id: string; name: string; company: string | null }
  }
}

interface Payment {
  id: string
  source: string
  transactionDate: string
  direction: string
  amount: number
  balance: number | null
  description: string | null
  payerName: string
  payerNameNormalized: string
  matchStatus: string
  reviewNote: string | null
  Allocations: Allocation[]
}

interface ContactForAr {
  id: string
  name: string
  nameKana: string | null
  company: string | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  UNMATCHED:       { label: '未消込',      color: 'bg-red-100 text-red-700' },
  NEEDS_REVIEW:    { label: '要確認',      color: 'bg-yellow-100 text-yellow-700' },
  AUTO_MATCHED:    { label: '自動消込済',  color: 'bg-green-100 text-green-700' },
  MANUAL_MATCHED:  { label: '手動消込済',  color: 'bg-blue-100 text-blue-700' },
  OTHER_REVENUE:   { label: 'その他売上',  color: 'bg-purple-100 text-purple-700' },
  IGNORED:         { label: '対象外',      color: 'bg-gray-100 text-gray-500' },
}

const DIRECTION_FILTERS = [
  { key: 'IN',  label: '入金のみ' },
  { key: 'OUT', label: '出金のみ' },
  { key: 'ALL', label: '全取引' },
]

const STATUS_FILTERS = [
  { key: 'PENDING', label: '要対応' },
  { key: 'UNMATCHED', label: '未消込' },
  { key: 'NEEDS_REVIEW', label: '要確認' },
  { key: 'MATCHED', label: '消込済' },
  { key: 'RESOLVED', label: '処理済' },
  { key: 'ALL', label: 'すべて' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function fmtMonth(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function PaymentsClient({
  payments: initial,
  arsForMatching,
  contactsForAr,
  latestBalance,
  latestBalanceDate,
}: {
  payments: Payment[]
  arsForMatching: ARForMatching[]
  contactsForAr: ContactForAr[]
  latestBalance: number | null
  latestBalanceDate: string | null
}) {
  const router = useRouter()
  const [payments] = useState(initial)
  const [directionFilter, setDirectionFilter] = useState('IN')
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [monthFilter, setMonthFilter] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null)
  const [arSearch, setArSearch] = useState('')

  // 処理オプションのモーダル状態
  const [actionMenu, setActionMenu] = useState<string | null>(null) // paymentId
  const [createArModal, setCreateArModal] = useState<string | null>(null) // paymentId
  const [resolveModal, setResolveModal] = useState<{ paymentId: string; action: 'OTHER_REVENUE' | 'IGNORED' } | null>(null)

  // AR新規作成フォーム
  const [arContactSearch, setArContactSearch] = useState('')
  const [arSelectedContact, setArSelectedContact] = useState<ContactForAr | null>(null)
  const [arServiceName, setArServiceName] = useState('')

  // resolve フォーム
  const [resolveNote, setResolveNote] = useState('')
  const [resolveServiceName, setResolveServiceName] = useState('その他売上')

  // 月のリスト
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    payments.forEach(p => set.add(fmtMonth(p.transactionDate)))
    return Array.from(set).sort().reverse()
  }, [payments])

  const filtered = useMemo(() => {
    let list = payments
    // 方向フィルタ
    if (directionFilter === 'IN') list = list.filter(p => p.direction === 'IN')
    else if (directionFilter === 'OUT') list = list.filter(p => p.direction === 'OUT')
    // ステータスフィルタ（入金のみに適用）
    if (directionFilter !== 'OUT') {
      if (statusFilter === 'PENDING') list = list.filter(p => p.direction === 'OUT' || p.matchStatus === 'UNMATCHED' || p.matchStatus === 'NEEDS_REVIEW')
      else if (statusFilter === 'MATCHED') list = list.filter(p => p.direction === 'OUT' || p.matchStatus === 'AUTO_MATCHED' || p.matchStatus === 'MANUAL_MATCHED')
      else if (statusFilter === 'RESOLVED') list = list.filter(p => p.direction === 'OUT' || p.matchStatus === 'OTHER_REVENUE' || p.matchStatus === 'IGNORED')
      else if (statusFilter !== 'ALL') list = list.filter(p => p.direction === 'OUT' || p.matchStatus === statusFilter)
    }
    // 月フィルタ
    if (monthFilter) list = list.filter(p => fmtMonth(p.transactionDate) === monthFilter)
    return list
  }, [payments, directionFilter, statusFilter, monthFilter])

  // サマリ: 現在の filter 条件での集計
  const summary = useMemo(() => {
    const inTx = filtered.filter(p => p.direction === 'IN')
    const outTx = filtered.filter(p => p.direction === 'OUT')
    const unmatched = inTx.filter(p => p.matchStatus === 'UNMATCHED')
    const review = inTx.filter(p => p.matchStatus === 'NEEDS_REVIEW')
    const matched = inTx.filter(p => p.matchStatus === 'AUTO_MATCHED' || p.matchStatus === 'MANUAL_MATCHED')
    return {
      totalIn: inTx.reduce((s, p) => s + p.amount, 0),
      totalInCount: inTx.length,
      totalOut: outTx.reduce((s, p) => s + p.amount, 0),
      totalOutCount: outTx.length,
      unmatchedAmount: unmatched.reduce((s, p) => s + p.amount, 0),
      unmatchedCount: unmatched.length,
      reviewAmount: review.reduce((s, p) => s + p.amount, 0),
      reviewCount: review.length,
      matchedAmount: matched.reduce((s, p) => s + p.amount, 0),
      matchedCount: matched.length,
    }
  }, [filtered])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/payments/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'アップロード失敗')
      setUploadResult(
        `取込完了: 総${data.total}件 (入金${data.inCreated}/出金${data.outCreated}) → ` +
        `新規${data.created} / 自動消込${data.autoMatched} / 要確認${data.needsReview} / 未消込${data.unmatched} / 重複スキップ${data.skippedDup}`
      )
      router.refresh()
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'エラー')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleAllocate(paymentId: string, arId: string) {
    const res = await fetch(`/api/payments/${paymentId}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountsReceivableId: arId }),
    })
    if (res.ok) {
      setOpenPaymentId(null)
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({ error: 'エラー' }))
      alert(err.error || '消込失敗')
    }
  }

  async function handleUnallocate(paymentId: string, arId: string) {
    if (!confirm('この消込を取り消しますか？')) return
    const res = await fetch(`/api/payments/${paymentId}/allocate?arId=${arId}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else alert('取消失敗')
  }

  async function handleCreateArAndAllocate(paymentId: string) {
    if (!arSelectedContact || !arServiceName) {
      alert('顧客とサービス名を入力してください')
      return
    }
    const res = await fetch(`/api/payments/${paymentId}/create-ar-and-allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId: arSelectedContact.id,
        serviceName: arServiceName,
      }),
    })
    if (res.ok) {
      setCreateArModal(null)
      setArSelectedContact(null)
      setArServiceName('')
      setArContactSearch('')
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({ error: 'エラー' }))
      alert(err.error || '処理失敗')
    }
  }

  async function handleResolve() {
    if (!resolveModal) return
    const res = await fetch(`/api/payments/${resolveModal.paymentId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: resolveModal.action,
        note: resolveNote || undefined,
        serviceName: resolveModal.action === 'OTHER_REVENUE' ? resolveServiceName : undefined,
      }),
    })
    if (res.ok) {
      setResolveModal(null)
      setResolveNote('')
      setResolveServiceName('その他売上')
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({ error: 'エラー' }))
      alert(err.error || '処理失敗')
    }
  }

  const filteredContacts = useMemo(() => {
    const q = arContactSearch.toLowerCase().trim()
    if (!q) return contactsForAr.slice(0, 20)
    return contactsForAr
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.nameKana || '').toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [contactsForAr, arContactSearch])

  const filteredArs = useMemo(() => {
    const q = arSearch.toLowerCase().trim()
    const openPayment = payments.find(p => p.id === openPaymentId)
    let list = arsForMatching
    if (openPayment) {
      list = [...arsForMatching].sort((a, b) => {
        const ra = a.amount - a.paidAmount
        const rb = b.amount - b.paidAmount
        const ea = ra === openPayment.amount ? 0 : 1
        const eb = rb === openPayment.amount ? 0 : 1
        if (ea !== eb) return ea - eb
        return Math.abs(ra - openPayment.amount) - Math.abs(rb - openPayment.amount)
      })
    }
    if (!q) return list.slice(0, 30)
    return list
      .filter(a =>
        (a.Contact.company || '').toLowerCase().includes(q) ||
        a.Contact.name.toLowerCase().includes(q) ||
        (a.Contact.nameKana || '').toLowerCase().includes(q) ||
        a.serviceName.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [arsForMatching, arSearch, openPaymentId, payments])

  const netChange = summary.totalIn - summary.totalOut

  return (
    <div className="space-y-5">
      {/* 全体サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-5">
          <p className="text-xs text-blue-700 font-medium">🏦 最新残高</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            {latestBalance !== null ? `¥${latestBalance.toLocaleString()}` : '—'}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            {latestBalanceDate ? fmtDate(latestBalanceDate) + ' 時点' : 'CSVに残高列が必要'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">⬆ 入金合計（絞込後）</p>
          <p className="text-2xl font-bold text-green-600 mt-1">¥{summary.totalIn.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.totalInCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">⬇ 出金合計（絞込後）</p>
          <p className="text-2xl font-bold text-red-600 mt-1">¥{summary.totalOut.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.totalOutCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">⚖ 純増減（絞込後）</p>
          <p className={`text-2xl font-bold mt-1 ${netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {netChange >= 0 ? '+' : ''}¥{netChange.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">入金 − 出金</p>
        </div>
      </div>

      {/* 入金ステータス別サマリ */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">未消込入金</p>
          <p className="text-xl font-bold text-red-600 mt-1">¥{summary.unmatchedAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.unmatchedCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">要確認入金</p>
          <p className="text-xl font-bold text-yellow-600 mt-1">¥{summary.reviewAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.reviewCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">消込済入金</p>
          <p className="text-xl font-bold text-green-600 mt-1">¥{summary.matchedAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.matchedCount}件</p>
        </div>
      </div>

      {/* Filter + Upload */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          {/* 方向フィルタ */}
          <div className="flex gap-1">
            {DIRECTION_FILTERS.map(f => (
              <button key={f.key} onClick={() => setDirectionFilter(f.key)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  directionFilter === f.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          {/* 月フィルタ */}
          {availableMonths.length > 0 && (
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
              <option value="">全月</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {/* ステータスフィルタ（入金時のみ意味あり） */}
          {directionFilter !== 'OUT' && (
            <div className="flex gap-1">
              {STATUS_FILTERS.map(f => (
                <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    statusFilter === f.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'アップロード中...' : '📄 CSVを取り込む'}
          </button>
        </div>
      </div>

      {uploadResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">{uploadResult}</div>
      )}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{uploadError}</div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            {payments.length === 0
              ? 'まだ入出金データがありません。右上の「CSVを取り込む」から開始してください。'
              : '該当する取引はありません'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left px-4 py-2 font-medium w-20">取引日</th>
                <th className="text-center px-2 py-2 font-medium w-16">区分</th>
                <th className="text-left px-4 py-2 font-medium">相手</th>
                <th className="text-right px-4 py-2 font-medium">金額</th>
                <th className="text-right px-4 py-2 font-medium">残高</th>
                <th className="text-left px-4 py-2 font-medium">ステータス</th>
                <th className="text-left px-4 py-2 font-medium">割当先</th>
                <th className="text-right px-4 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isIn = p.direction === 'IN'
                const meta = STATUS_META[p.matchStatus] || { label: p.matchStatus, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.transactionDate)}</td>
                    <td className="px-2 py-3 text-center">
                      {isIn ? (
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">⬆入金</span>
                      ) : (
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">⬇出金</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-gray-900">{p.payerName}</p>
                      {p.description && p.description !== p.payerName && (
                        <p className="text-[10px] text-gray-400 truncate max-w-xs">{p.description}</p>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${isIn ? 'text-green-700' : 'text-red-700'}`}>
                      {isIn ? '+' : '−'}¥{p.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">
                      {p.balance !== null ? `¥${p.balance.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.Allocations.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <div className="space-y-1">
                          {p.Allocations.map(a => (
                            <div key={a.id} className="flex items-center gap-2">
                              <Link href={`/accounts-receivable`} className="text-blue-600 hover:underline">
                                {a.AccountsReceivable.Contact.company || a.AccountsReceivable.Contact.name}
                              </Link>
                              <span className="text-gray-500">¥{a.allocatedAmount.toLocaleString()}</span>
                              <button onClick={() => handleUnallocate(p.id, a.accountsReceivableId)}
                                className="text-[10px] text-red-500 hover:underline">取消</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      {isIn && !['AUTO_MATCHED', 'MANUAL_MATCHED', 'OTHER_REVENUE', 'IGNORED'].includes(p.matchStatus) && (
                        <div className="inline-block">
                          <button onClick={() => setActionMenu(actionMenu === p.id ? null : p.id)}
                            className="text-[10px] px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50">
                            処理 ▼
                          </button>
                          {actionMenu === p.id && (
                            <div className="absolute right-4 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48"
                              onMouseLeave={() => setActionMenu(null)}>
                              <button onClick={() => { setOpenPaymentId(p.id); setArSearch(''); setActionMenu(null) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-gray-700">
                                🔗 売掛と一致させる
                              </button>
                              <button onClick={() => { setCreateArModal(p.id); setArSelectedContact(null); setArServiceName(''); setArContactSearch(''); setActionMenu(null) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-gray-700">
                                ➕ 売掛を作って一致
                              </button>
                              <button onClick={() => { setResolveModal({ paymentId: p.id, action: 'OTHER_REVENUE' }); setResolveNote(''); setResolveServiceName('その他売上'); setActionMenu(null) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 text-gray-700">
                                💰 その他売上として処理
                              </button>
                              <button onClick={() => { setResolveModal({ paymentId: p.id, action: 'IGNORED' }); setResolveNote(''); setActionMenu(null) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 text-gray-500">
                                🚫 売上として計上しない
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {isIn && p.matchStatus === 'IGNORED' && (
                        <span className="text-[10px] text-gray-400">{p.reviewNote || '対象外'}</span>
                      )}
                      {isIn && p.matchStatus === 'OTHER_REVENUE' && (
                        <span className="text-[10px] text-purple-500">{p.reviewNote || 'その他売上'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* A) 売掛と一致させるモーダル */}
      {openPaymentId && (() => {
        const payment = payments.find(p => p.id === openPaymentId)
        if (!payment) return null
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setOpenPaymentId(null)}>
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b">
                <h2 className="text-sm font-bold">🔗 売掛と一致させる</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {payment.payerName} / ¥{payment.amount.toLocaleString()} / {fmtDate(payment.transactionDate)}
                </p>
                <input
                  type="text"
                  placeholder="会社名・件名で検索..."
                  value={arSearch}
                  onChange={e => setArSearch(e.target.value)}
                  className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredArs.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-500">該当する売掛金が見つかりません</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left px-4 py-2">顧客</th>
                        <th className="text-left px-4 py-2">件名</th>
                        <th className="text-right px-4 py-2">残額</th>
                        <th className="text-left px-4 py-2">期日</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArs.map(ar => {
                        const remaining = ar.amount - ar.paidAmount
                        const isExact = remaining === payment.amount
                        return (
                          <tr key={ar.id} className={`border-b border-gray-50 ${isExact ? 'bg-green-50' : ''}`}>
                            <td className="px-4 py-2 text-xs">
                              <p className="font-medium">{ar.Contact.company || ar.Contact.name}</p>
                              {ar.Contact.nameKana && <p className="text-[10px] text-gray-400">{ar.Contact.nameKana}</p>}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-700">{ar.serviceName}</td>
                            <td className="px-4 py-2 text-xs text-right font-medium">
                              ¥{remaining.toLocaleString()}
                              {isExact && <span className="ml-1 text-green-600">✓</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(ar.dueDate)}</td>
                            <td className="px-4 py-2 text-right">
                              <button onClick={() => handleAllocate(payment.id, ar.id)}
                                className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                                消込
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-4 border-t">
                <button onClick={() => setOpenPaymentId(null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">閉じる</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* B) 売掛を作って一致させるモーダル */}
      {createArModal && (() => {
        const payment = payments.find(p => p.id === createArModal)
        if (!payment) return null
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setCreateArModal(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b">
                <h2 className="text-sm font-bold">➕ 売掛を作って一致させる</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {payment.payerName} / ¥{payment.amount.toLocaleString()} / {fmtDate(payment.transactionDate)}
                </p>
              </div>
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                {/* 顧客選択 */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">顧客を選択</label>
                  {arSelectedContact ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-blue-800">
                        {arSelectedContact.company || arSelectedContact.name}
                      </span>
                      <button onClick={() => setArSelectedContact(null)}
                        className="text-xs text-red-500 hover:underline ml-auto">変更</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="顧客名で検索..."
                        value={arContactSearch}
                        onChange={e => setArContactSearch(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        autoFocus
                      />
                      <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                        {filteredContacts.map(c => (
                          <button key={c.id} onClick={() => { setArSelectedContact(c); setArContactSearch('') }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-gray-50">
                            <span className="font-medium">{c.company || c.name}</span>
                            {c.company && <span className="text-gray-400 ml-2">{c.name}</span>}
                          </button>
                        ))}
                        {filteredContacts.length === 0 && (
                          <p className="p-3 text-xs text-gray-400 text-center">該当なし</p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* サービス名 */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">サービス名</label>
                  <input
                    type="text"
                    placeholder="例: IT内製化支援"
                    value={arServiceName}
                    onChange={e => setArServiceName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                {/* 金額（プリフィル） */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">金額（税込）</label>
                  <p className="text-lg font-bold text-gray-900">¥{payment.amount.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">入金額と同額で売掛を作成します</p>
                </div>
              </div>
              <div className="p-4 border-t flex gap-2">
                <button onClick={() => setCreateArModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">キャンセル</button>
                <button onClick={() => handleCreateArAndAllocate(payment.id)}
                  disabled={!arSelectedContact || !arServiceName}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 font-medium">
                  売掛作成 & 消込
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* C/D) その他売上 or 対象外モーダル */}
      {resolveModal && (() => {
        const payment = payments.find(p => p.id === resolveModal.paymentId)
        if (!payment) return null
        const isOtherRevenue = resolveModal.action === 'OTHER_REVENUE'
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setResolveModal(null)}>
            <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b">
                <h2 className="text-sm font-bold">
                  {isOtherRevenue ? '💰 その他売上として処理' : '🚫 売上として計上しない'}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {payment.payerName} / ¥{payment.amount.toLocaleString()} / {fmtDate(payment.transactionDate)}
                </p>
              </div>
              <div className="p-4 space-y-4">
                {isOtherRevenue && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">売上名</label>
                    <input
                      type="text"
                      value={resolveServiceName}
                      onChange={e => setResolveServiceName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    {isOtherRevenue ? 'メモ（任意）' : '理由メモ（任意）'}
                  </label>
                  <textarea
                    value={resolveNote}
                    onChange={e => setResolveNote(e.target.value)}
                    placeholder={isOtherRevenue ? '補足があれば入力' : '例: 返金、誤入金、内部振替'}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {isOtherRevenue && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-xs text-purple-700">
                      売掛を経由せず「その他売上」として ¥{payment.amount.toLocaleString()} を計上します。
                    </p>
                  </div>
                )}
                {!isOtherRevenue && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-600">
                      この入金を売上として計上しません。返金・誤入金・内部振替などが該当します。
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex gap-2">
                <button onClick={() => setResolveModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">キャンセル</button>
                <button onClick={handleResolve}
                  className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium ${
                    isOtherRevenue ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 hover:bg-gray-700'
                  }`}>
                  {isOtherRevenue ? 'その他売上として計上' : '対象外にする'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
