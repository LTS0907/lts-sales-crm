'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import IssueInvoiceButton from './IssueInvoiceButton'

// ---------------------------------------------------------
// 型定義
// ---------------------------------------------------------
export interface SubscriptionListItem {
  id: string
  serviceName: string
  billingType: string   // "FIXED" | "VARIABLE"
  billingCycle: string  // "MONTHLY" | "YEARLY"
  fixedAmount: number | null
  status: string        // "ACTIVE" | "PAUSED" | "CANCELLED"
  invoiceSubject: string
  Contact: {
    id: string
    name: string
    company: string | null
    email: string | null
  }
  BillingRecord: {
    billingMonth: string
    status: string
  }[]
}

// ---------------------------------------------------------
// ラベル定義
// ---------------------------------------------------------
const statusLabels: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '有効', color: 'bg-green-100 text-green-700' },
  PAUSED: { label: '一時停止', color: 'bg-yellow-100 text-yellow-700' },
  CANCELLED: { label: '解約済', color: 'bg-gray-100 text-gray-500' },
}

const billingTypeLabels: Record<string, { label: string; color: string }> = {
  FIXED: { label: '固定額', color: 'bg-blue-100 text-blue-700' },
  VARIABLE: { label: '変動額', color: 'bg-orange-100 text-orange-700' },
}

const billingCycleLabels: Record<string, { label: string; color: string }> = {
  MONTHLY: { label: '月次', color: 'bg-gray-100 text-gray-600' },
  YEARLY: { label: '年次', color: 'bg-purple-100 text-purple-700' },
}

// ---------------------------------------------------------
// 月選択肢（過去6ヶ月 + 今月 + 来月）
// ---------------------------------------------------------
function buildMonthOptions(): { value: string; label: string }[] {
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let offset = -6; offset <= 1; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
    options.push({ value, label })
  }
  return options
}

// ---------------------------------------------------------
// 一括発行モーダルの各行の処理結果
// ---------------------------------------------------------
type BulkItemStatus = 'pending' | 'processing' | 'success' | 'error'

interface BulkItemResult {
  subscriptionId: string
  contactName: string
  serviceName: string
  amount: number
  status: BulkItemStatus
  errorMessage?: string
  spreadsheetUrl?: string
}

// ---------------------------------------------------------
// 一括発行モーダル
// ---------------------------------------------------------
interface BulkIssueModalProps {
  selectedSubs: SubscriptionListItem[]
  onClose: () => void
  onComplete: () => void
}

function BulkIssueModal({ selectedSubs, onClose, onComplete }: BulkIssueModalProps) {
  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const defaultMonth = monthOptions[6]?.value ?? monthOptions[0]?.value ?? ''
  const [issueMonth, setIssueMonth] = useState(defaultMonth)
  const [results, setResults] = useState<BulkItemResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDone, setIsDone] = useState(false)

  // 全サブスクを FIXED / VARIABLE に分類
  const fixedSubs = useMemo(
    () => selectedSubs.filter(s => s.billingType === 'FIXED'),
    [selectedSubs]
  )
  const variableSubs = useMemo(
    () => selectedSubs.filter(s => s.billingType === 'VARIABLE'),
    [selectedSubs]
  )

  // 金額入力状態: subscriptionId → 金額文字列
  // FIXED は初期値として fixedAmount を設定、VARIABLE は空
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const sub of selectedSubs) {
      init[sub.id] = sub.billingType === 'FIXED' && sub.fixedAmount != null
        ? String(sub.fixedAmount)
        : ''
    }
    return init
  })

  const selectedMonthLabel = monthOptions.find(o => o.value === issueMonth)?.label ?? issueMonth

  // VARIABLE で未入力（空または0以下）の件数
  const variableUnfilledCount = variableSubs.filter(sub => {
    const v = amounts[sub.id] ?? ''
    const n = parseInt(v, 10)
    return v === '' || isNaN(n) || n <= 0
  }).length

  // 発行可能かどうか
  const canIssue = selectedSubs.length > 0 && variableUnfilledCount === 0

  // ESCで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isProcessing, onClose])

  // bodyスクロール制御
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleBulkIssue() {
    if (!canIssue) return

    if (!confirm(`${selectedMonthLabel}分の請求書を${selectedSubs.length}件発行します。よろしいですか？`)) return

    // 初期状態セット（全サブスク）
    const initialResults: BulkItemResult[] = selectedSubs.map(sub => ({
      subscriptionId: sub.id,
      contactName: sub.Contact.name,
      serviceName: sub.serviceName,
      amount: parseInt(amounts[sub.id] ?? '0', 10) || 0,
      status: 'pending',
    }))
    setResults(initialResults)
    setIsProcessing(true)

    // 3並列処理
    const queue = [...selectedSubs]
    const updateResult = (id: string, patch: Partial<BulkItemResult>) => {
      setResults(prev =>
        prev.map(r => (r.subscriptionId === id ? { ...r, ...patch } : r))
      )
    }

    const worker = async () => {
      while (queue.length > 0) {
        const sub = queue.shift()
        if (!sub) break

        updateResult(sub.id, { status: 'processing' })

        const amount = parseInt(amounts[sub.id] ?? '0', 10) || 0

        try {
          const res = await fetch(
            `/api/subscriptions/${sub.id}/billing/generate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ month: issueMonth, amount }),
            }
          )
          const data = await res.json()

          if (!res.ok) {
            const errMsg =
              res.status === 409
                ? 'すでに発行済み'
                : (data.error ?? '発行に失敗しました')
            updateResult(sub.id, { status: 'error', errorMessage: errMsg })
          } else {
            updateResult(sub.id, {
              status: 'success',
              spreadsheetUrl: data.spreadsheetUrl,
            })
          }
        } catch {
          updateResult(sub.id, { status: 'error', errorMessage: '通信エラー' })
        }
      }
    }

    await Promise.all([worker(), worker(), worker()])

    setIsProcessing(false)
    setIsDone(true)
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length

  function handleClose() {
    if (isDone) {
      onComplete()
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!isProcessing ? handleClose : undefined}
        aria-hidden="true"
      />

      {/* モーダル本体 */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        style={{ animation: 'slideUp 0.15s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label="一括請求書発行"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">一括請求書発行</h2>
            {variableSubs.length > 0 && variableUnfilledCount > 0 && !isDone && results.length === 0 && (
              <p className="text-xs text-orange-600 mt-0.5">
                未入力: {variableUnfilledCount}件（VARIABLE）
              </p>
            )}
          </div>
          {!isProcessing && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="閉じる"
            >
              ✕
            </button>
          )}
        </div>

        {/* ボディ */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {/* 選択件数サマリ */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <p className="font-medium text-gray-900">選択中: {selectedSubs.length}件のサブスク</p>
          </div>

          {/* 対象月（処理前のみ） */}
          {!isDone && results.length === 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                対象月 <span className="text-red-500">*</span>
              </label>
              <select
                value={issueMonth}
                onChange={e => setIssueMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* 発行対象一覧（処理前） */}
          {!isDone && results.length === 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">発行対象一覧:</p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {/* FIXED グループ */}
                {fixedSubs.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-gray-50 text-xs text-gray-500 font-medium">
                      FIXED（金額自動・編集可）
                    </div>
                    {fixedSubs.map(sub => (
                      <div
                        key={sub.id}
                        className="px-3 py-2 text-sm flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-gray-900 truncate">
                            ✅ {sub.Contact.name}
                          </span>
                          <span className="text-gray-500 ml-1 text-xs truncate">
                            - {sub.serviceName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-gray-500 text-sm">¥</span>
                          <input
                            type="number"
                            min="1"
                            value={amounts[sub.id] ?? ''}
                            onChange={e => setAmounts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                            className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {/* VARIABLE グループ */}
                {variableSubs.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-orange-50 text-xs text-orange-700 font-medium">
                      VARIABLE（金額入力必須）
                    </div>
                    {variableSubs.map(sub => {
                      const val = amounts[sub.id] ?? ''
                      const n = parseInt(val, 10)
                      const isEmpty = val === ''
                      const isInvalid = !isEmpty && (isNaN(n) || n <= 0)
                      return (
                        <div
                          key={sub.id}
                          className="px-3 py-2 text-sm flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-gray-900 truncate">
                              ⚠️ {sub.Contact.name}
                            </span>
                            <span className="text-gray-500 ml-1 text-xs truncate">
                              - {sub.serviceName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-gray-500 text-sm">¥</span>
                            <input
                              type="number"
                              min="1"
                              placeholder="未入力"
                              value={val}
                              onChange={e => setAmounts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                              className={`w-28 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 ${
                                isEmpty
                                  ? 'border-orange-400 bg-orange-50 focus:ring-orange-300'
                                  : isInvalid
                                  ? 'border-red-400 bg-red-50 focus:ring-red-300'
                                  : 'border-green-400 focus:ring-green-300'
                              }`}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
              {variableSubs.length > 0 && variableUnfilledCount > 0 && (
                <p className="text-xs text-orange-600 mt-1.5">
                  ※ すべての金額を入力すると発行可能になります
                </p>
              )}
            </div>
          )}

          {/* 処理中 / 処理後の結果表示 */}
          {results.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">
                {isDone
                  ? `完了: 成功 ${successCount}件 / 失敗 ${errorCount}件`
                  : '処理中...'}
              </p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {results.map(r => (
                  <div
                    key={r.subscriptionId}
                    className="px-3 py-2 text-sm flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {r.status === 'pending' && (
                          <span className="text-gray-400 text-xs">⏳</span>
                        )}
                        {r.status === 'processing' && (
                          <svg className="animate-spin w-3 h-3 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        )}
                        {r.status === 'success' && (
                          <span className="text-green-500 text-xs">✅</span>
                        )}
                        {r.status === 'error' && (
                          <span className="text-red-500 text-xs">❌</span>
                        )}
                        <span className="font-medium text-gray-900 truncate">{r.contactName}</span>
                        <span className="text-gray-400 text-xs">¥{r.amount.toLocaleString()}</span>
                      </div>
                      {r.status === 'error' && r.errorMessage && (
                        <p className="text-xs text-red-600 mt-0.5 ml-5">{r.errorMessage}</p>
                      )}
                      {r.status === 'processing' && (
                        <p className="text-xs text-blue-500 mt-0.5 ml-5">処理中...</p>
                      )}
                    </div>
                    {r.status === 'success' && r.spreadsheetUrl && (
                      <a
                        href={r.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex-shrink-0"
                      >
                        開く →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            ※ 発行と同時にDriveに請求書が作成され、売掛金にも自動登録されます
          </p>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          {isDone ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              閉じる
            </button>
          ) : results.length > 0 ? (
            // 処理中は閉じるボタンなし（スピナーのみ）
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              発行処理中...
            </div>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleBulkIssue}
                disabled={!canIssue}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                一括発行 ({selectedSubs.length}件)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------
// メインのリストClient Component
// ---------------------------------------------------------
interface SubscriptionsListClientProps {
  subscriptions: SubscriptionListItem[]
}

export default function SubscriptionsListClient({ subscriptions }: SubscriptionsListClientProps) {
  const router = useRouter()

  // チェック済みID set
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkModalOpen, setBulkModalOpen] = useState(false)

  // ACTIVE なサブスクのみチェックボックス対象
  const activeSubs = useMemo(
    () => subscriptions.filter(s => s.status === 'ACTIVE'),
    [subscriptions]
  )

  const allActiveChecked =
    activeSubs.length > 0 && activeSubs.every(s => checkedIds.has(s.id))

  const toggleAll = useCallback(() => {
    if (allActiveChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(activeSubs.map(s => s.id)))
    }
  }, [allActiveChecked, activeSubs])

  const toggleOne = useCallback((id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectedSubs = useMemo(
    () => subscriptions.filter(s => checkedIds.has(s.id)),
    [subscriptions, checkedIds]
  )

  const handleBulkComplete = useCallback(() => {
    setCheckedIds(new Set())
    router.refresh()
  }, [router])

  return (
    <>
      {/* 一括処理バー（選択時に表示） */}
      {checkedIds.size > 0 && (
        <div className="sticky top-0 z-30 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3 flex-wrap shadow-sm">
          <span className="text-sm font-medium text-blue-800">
            選択中: {checkedIds.size}件
          </span>
          <button
            onClick={toggleAll}
            className="text-xs text-blue-600 hover:underline"
          >
            {allActiveChecked ? '選択解除' : '全選択'}
          </button>
          <button
            onClick={() => setCheckedIds(new Set())}
            className="text-xs text-blue-600 hover:underline"
          >
            解除
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setBulkModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            一括発行
          </button>
          <button
            onClick={() => setCheckedIds(new Set())}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="選択解除"
          >
            ✕
          </button>
        </div>
      )}

      {/* PC: テーブル表示 */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 w-10">
                {/* 全選択チェックボックス */}
                <input
                  type="checkbox"
                  checked={allActiveChecked}
                  onChange={toggleAll}
                  disabled={activeSubs.length === 0}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40 cursor-pointer"
                  aria-label="全選択"
                />
              </th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">顧客</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">サービス</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">種別</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">月額</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">ステータス</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">直近請求</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map(sub => {
              const st = statusLabels[sub.status] || { label: sub.status, color: 'bg-gray-100' }
              const bt = billingTypeLabels[sub.billingType] || { label: sub.billingType, color: 'bg-gray-100' }
              const bc = billingCycleLabels[sub.billingCycle] || billingCycleLabels.MONTHLY
              const lastBilling = sub.BillingRecord[0]
              const isActive = sub.status === 'ACTIVE'
              const isChecked = checkedIds.has(sub.id)

              return (
                <tr
                  key={sub.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 ${isChecked ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-3 w-10">
                    {isActive && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(sub.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        aria-label={`${sub.Contact.name}を選択`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${sub.Contact.id}`} className="hover:underline">
                      <p className="text-sm font-medium text-gray-900">{sub.Contact.name}</p>
                      {sub.Contact.company && (
                        <p className="text-xs text-gray-500">{sub.Contact.company}</p>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{sub.serviceName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${bt.color}`}>
                        {bt.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${bc.color}`}>
                        {bc.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    {sub.billingType === 'FIXED' && sub.fixedAmount
                      ? `¥${sub.fixedAmount.toLocaleString()}`
                      : '—'
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lastBilling ? `${lastBilling.billingMonth} (${lastBilling.status})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isActive && (
                        <IssueInvoiceButton
                          subscriptionId={sub.id}
                          contactName={sub.Contact.name}
                          contactCompany={sub.Contact.company}
                          serviceName={sub.serviceName}
                          billingType={sub.billingType}
                          billingCycle={sub.billingCycle}
                          fixedAmount={sub.fixedAmount}
                        />
                      )}
                      <Link
                        href={`/subscriptions/${sub.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* スマホ・iPad: カード表示 */}
      <div className="lg:hidden space-y-3">
        {subscriptions.map(sub => {
          const st = statusLabels[sub.status] || { label: sub.status, color: 'bg-gray-100' }
          const bt = billingTypeLabels[sub.billingType] || { label: sub.billingType, color: 'bg-gray-100' }
          const bc = billingCycleLabels[sub.billingCycle] || billingCycleLabels.MONTHLY
          const lastBilling = sub.BillingRecord[0]
          const isActive = sub.status === 'ACTIVE'
          const isChecked = checkedIds.has(sub.id)

          return (
            <div
              key={sub.id}
              className={`bg-white rounded-xl border p-4 ${isChecked ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
            >
              <div className="flex items-start gap-3">
                {/* チェックボックス（ACTIVE のみ） */}
                {isActive && (
                  <div className="pt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(sub.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      aria-label={`${sub.Contact.name}を選択`}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Link href={`/contacts/${sub.Contact.id}`} className="flex-1 min-w-0 hover:underline">
                      <p className="text-sm font-medium text-gray-900 truncate">{sub.Contact.name}</p>
                      {sub.Contact.company && (
                        <p className="text-xs text-gray-500 truncate">{sub.Contact.company}</p>
                      )}
                    </Link>
                    <Link
                      href={`/subscriptions/${sub.id}`}
                      className="flex-shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      詳細 →
                    </Link>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{sub.serviceName}</p>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                      {st.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bt.color}`}>
                      {bt.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bc.color}`}>
                      {bc.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">
                      {sub.billingType === 'FIXED' && sub.fixedAmount
                        ? `¥${sub.fixedAmount.toLocaleString()}/月`
                        : '変動額'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {lastBilling ? `直近: ${lastBilling.billingMonth}` : '請求実績なし'}
                    </span>
                  </div>
                  {isActive && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                      <IssueInvoiceButton
                        subscriptionId={sub.id}
                        contactName={sub.Contact.name}
                        contactCompany={sub.Contact.company}
                        serviceName={sub.serviceName}
                        billingType={sub.billingType}
                        billingCycle={sub.billingCycle}
                        fixedAmount={sub.fixedAmount}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 一括発行モーダル */}
      {bulkModalOpen && (
        <BulkIssueModal
          selectedSubs={selectedSubs}
          onClose={() => setBulkModalOpen(false)}
          onComplete={handleBulkComplete}
        />
      )}
    </>
  )
}
