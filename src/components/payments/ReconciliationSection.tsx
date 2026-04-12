'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Candidate {
  paymentId: string
  paymentDate: string
  payerName: string
  paymentAmount: number
  arId: string
  arContact: string
  arService: string
  arRemaining: number
  score: number
}

interface UnmatchedPayment {
  id: string
  transactionDate: string
  payerName: string
  amount: number
}

export default function ReconciliationSection({
  candidates,
  unmatchedPayments,
}: {
  candidates: Candidate[]
  unmatchedPayments: UnmatchedPayment[]
}) {
  const router = useRouter()
  const [processing, setProcessing] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  async function handleAllocate(paymentId: string, arId: string) {
    setProcessing(paymentId)
    setResult(null)
    try {
      const res = await fetch(`/api/payments/${paymentId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountsReceivableId: arId }),
      })
      if (res.ok) {
        setResult({ id: paymentId, ok: true, msg: '消込完了' })
        router.refresh()
      } else {
        const err = await res.json().catch(() => ({ error: '消込失敗' }))
        setResult({ id: paymentId, ok: false, msg: err.error })
      }
    } catch {
      setResult({ id: paymentId, ok: false, msg: 'ネットワークエラー' })
    } finally {
      setProcessing(null)
    }
  }

  if (candidates.length === 0 && unmatchedPayments.length === 0) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          🔄 入金消込
        </h2>
        <Link href="/payments" className="text-xs text-blue-600 hover:underline">
          入金一覧 →
        </Link>
      </div>

      {/* NEEDS_REVIEW: 消込候補 */}
      {candidates.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
            ⚡ 消込候補
            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs">
              {candidates.length}件
            </span>
          </h3>
          <div className="space-y-2">
            {candidates.map(c => (
              <div key={`${c.paymentId}-${c.arId}`}
                className="bg-white rounded-lg p-3 border border-yellow-100 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900">{c.payerName}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-blue-700">{c.arContact}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>入金 ¥{c.paymentAmount.toLocaleString()}</span>
                    <span>売掛残 ¥{c.arRemaining.toLocaleString()}</span>
                    <span>{new Date(c.paymentDate).toLocaleDateString('ja-JP')}</span>
                    {c.paymentAmount === c.arRemaining && (
                      <span className="text-green-600 font-medium">金額一致 ✓</span>
                    )}
                  </div>
                  {result?.id === c.paymentId && (
                    <p className={`text-xs mt-1 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {result.msg}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAllocate(c.paymentId, c.arId)}
                    disabled={processing === c.paymentId}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {processing === c.paymentId ? '処理中...' : '消込'}
                  </button>
                  <Link href="/payments"
                    className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                    詳細
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UNMATCHED: 未消込入金の通知バナー */}
      {unmatchedPayments.length > 0 && (
        <Link href="/payments?status=UNMATCHED" className="block">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
                  ⚠ 未消込の入金が {unmatchedPayments.length} 件あります
                </h3>
                <p className="text-xs text-red-600 mt-1">
                  合計 ¥{unmatchedPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                  — 入金一覧で処理してください
                </p>
              </div>
              <span className="text-red-400 text-lg">→</span>
            </div>
          </div>
        </Link>
      )}
    </div>
  )
}
