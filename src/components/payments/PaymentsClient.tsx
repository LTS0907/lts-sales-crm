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
  amount: number
  payerName: string
  payerNameNormalized: string
  matchStatus: string
  reviewNote: string | null
  Allocations: Allocation[]
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  UNMATCHED:       { label: '未消込',      color: 'bg-red-100 text-red-700' },
  NEEDS_REVIEW:    { label: '要確認',      color: 'bg-yellow-100 text-yellow-700' },
  AUTO_MATCHED:    { label: '自動消込済',  color: 'bg-green-100 text-green-700' },
  MANUAL_MATCHED:  { label: '手動消込済',  color: 'bg-blue-100 text-blue-700' },
  IGNORED:         { label: '無視',        color: 'bg-gray-100 text-gray-500' },
}

const FILTERS = [
  { key: 'PENDING', label: '要対応（未消込・要確認）' },
  { key: 'UNMATCHED', label: '未消込' },
  { key: 'NEEDS_REVIEW', label: '要確認' },
  { key: 'MATCHED', label: '消込済' },
  { key: 'ALL', label: 'すべて' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function PaymentsClient({
  payments: initial,
  arsForMatching,
}: {
  payments: Payment[]
  arsForMatching: ARForMatching[]
}) {
  const router = useRouter()
  const [payments, setPayments] = useState(initial)
  const [filter, setFilter] = useState('PENDING')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null)
  const [arSearch, setArSearch] = useState('')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return payments
    if (filter === 'PENDING') return payments.filter(p => p.matchStatus === 'UNMATCHED' || p.matchStatus === 'NEEDS_REVIEW')
    if (filter === 'MATCHED') return payments.filter(p => p.matchStatus === 'AUTO_MATCHED' || p.matchStatus === 'MANUAL_MATCHED')
    return payments.filter(p => p.matchStatus === filter)
  }, [payments, filter])

  const summary = useMemo(() => {
    const unmatched = payments.filter(p => p.matchStatus === 'UNMATCHED')
    const review = payments.filter(p => p.matchStatus === 'NEEDS_REVIEW')
    const matched = payments.filter(p => p.matchStatus === 'AUTO_MATCHED' || p.matchStatus === 'MANUAL_MATCHED')
    return {
      unmatchedAmount: unmatched.reduce((s, p) => s + p.amount, 0),
      unmatchedCount: unmatched.length,
      reviewAmount: review.reduce((s, p) => s + p.amount, 0),
      reviewCount: review.length,
      matchedAmount: matched.reduce((s, p) => s + p.amount, 0),
      matchedCount: matched.length,
    }
  }, [payments])

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
        `取込完了: 総${data.total}件 → 新規${data.created} / 自動消込${data.autoMatched} / 要確認${data.needsReview} / 未消込${data.unmatched} / 重複スキップ${data.skippedDup}`
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

  const filteredArs = useMemo(() => {
    const q = arSearch.toLowerCase().trim()
    const openPayment = payments.find(p => p.id === openPaymentId)
    let list = arsForMatching
    if (openPayment) {
      // 金額完全一致を先頭に
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

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">未消込</p>
          <p className="text-2xl font-bold text-red-600 mt-1">¥{summary.unmatchedAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.unmatchedCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">要確認</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">¥{summary.reviewAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.reviewCount}件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">消込済（累計）</p>
          <p className="text-2xl font-bold text-green-600 mt-1">¥{summary.matchedAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.matchedCount}件</p>
        </div>
      </div>

      {/* Upload + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              ? 'まだ入金データがありません。右上の「CSVを取り込む」から開始してください。'
              : '該当する入金はありません'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left px-4 py-2 font-medium">取引日</th>
                <th className="text-left px-4 py-2 font-medium">送金者名</th>
                <th className="text-right px-4 py-2 font-medium">金額</th>
                <th className="text-left px-4 py-2 font-medium">ステータス</th>
                <th className="text-left px-4 py-2 font-medium">割当先</th>
                <th className="text-right px-4 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const meta = STATUS_META[p.matchStatus] || { label: p.matchStatus, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.transactionDate)}</td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-gray-900">{p.payerName}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{p.payerNameNormalized}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">¥{p.amount.toLocaleString()}</td>
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
                    <td className="px-4 py-3 text-right">
                      {p.matchStatus !== 'AUTO_MATCHED' && p.matchStatus !== 'MANUAL_MATCHED' && (
                        <button onClick={() => { setOpenPaymentId(p.id === openPaymentId ? null : p.id); setArSearch('') }}
                          className="text-[10px] px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50">
                          {openPaymentId === p.id ? '閉じる' : '消込する'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Allocation modal (inline) */}
      {openPaymentId && (() => {
        const payment = payments.find(p => p.id === openPaymentId)
        if (!payment) return null
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setOpenPaymentId(null)}>
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b">
                <h2 className="text-sm font-bold">消込先を選択</h2>
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
    </div>
  )
}
