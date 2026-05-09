'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

interface IssueInvoiceButtonProps {
  subscriptionId: string
  contactName: string
  contactCompany: string | null
  serviceName: string
  billingType: string
  billingCycle: string
  fixedAmount: number | null
}

// 過去6ヶ月 + 今月 + 来月の選択肢（計8件）
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

interface IssueResult {
  spreadsheetUrl: string
  accountsReceivableId: string
}

export default function IssueInvoiceButton({
  subscriptionId,
  contactName,
  contactCompany,
  serviceName,
  billingType,
  billingCycle,
  fixedAmount,
}: IssueInvoiceButtonProps) {
  const [open, setOpen] = useState(false)

  // モーダルを開く/閉じるたびに状態をリセット
  const monthOptions = useMemo(() => buildMonthOptions(), [])
  // デフォルト: 今月（offset 0 = インデックス 6）
  const defaultMonth = monthOptions[6]?.value ?? monthOptions[0]?.value ?? ''

  const [issueMonth, setIssueMonth] = useState(defaultMonth)
  const [issueAmount, setIssueAmount] = useState<string>(
    billingType === 'FIXED' ? String(fixedAmount ?? '') : ''
  )
  const [issuing, setIssuing] = useState(false)
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)

  // モーダルが開くたびに状態リセット
  useEffect(() => {
    if (open) {
      setIssueMonth(defaultMonth)
      setIssueAmount(billingType === 'FIXED' ? String(fixedAmount ?? '') : '')
      setIssuing(false)
      setIssueResult(null)
      setIssueError(null)
    }
  }, [open, defaultMonth, billingType, fixedAmount])

  // ESCで閉じる
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // bodyスクロール制御
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleIssue() {
    const monthLabel = monthOptions.find(o => o.value === issueMonth)?.label ?? issueMonth
    const amount = parseInt(issueAmount, 10)

    if (billingType === 'VARIABLE' && (!issueAmount || isNaN(amount))) {
      setIssueError('変動額サブスクは金額の入力が必須です')
      return
    }

    if (!confirm(`${monthLabel}分の請求書を発行し、売掛金として登録します。よろしいですか？`)) return

    setIssuing(true)
    setIssueError(null)
    setIssueResult(null)

    try {
      const body: Record<string, unknown> = { month: issueMonth }
      if (billingType === 'VARIABLE') {
        body.amount = amount
      } else if (billingType === 'FIXED' && issueAmount && !isNaN(amount)) {
        // FIXED でも手入力で上書き可
        body.amount = amount
      }

      const res = await fetch(`/api/subscriptions/${subscriptionId}/billing/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setIssueError(data.error || '発行に失敗しました')
        return
      }

      setIssueResult({
        spreadsheetUrl: data.spreadsheetUrl,
        accountsReceivableId: data.accountsReceivableId,
      })
    } finally {
      setIssuing(false)
    }
  }

  const cycleLabel = billingCycle === 'YEARLY' ? '年次' : '月次'

  return (
    <>
      {/* トリガーボタン */}
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
      >
        請求書発行
      </button>

      {/* モーダル */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          {/* オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* モーダル本体 */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
            style={{ animation: 'slideUp 0.15s ease-out' }}
            role="dialog"
            aria-modal="true"
            aria-label="請求書を発行"
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">請求書を発行</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {/* ボディ */}
            <div className="px-5 py-5 space-y-4">
              {/* サブスク情報サマリー */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">顧客</span>
                  <p className="font-medium text-gray-900">
                    {contactName}
                    {contactCompany && (
                      <span className="text-gray-500 font-normal">（{contactCompany}）</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">サービス</span>
                  <p className="text-gray-700">{serviceName}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">サイクル</span>
                  <p className="text-gray-700">{cycleLabel}</p>
                </div>
              </div>

              {issueResult ? (
                /* 発行成功 */
                <div className="space-y-3">
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 font-medium">
                    ✅ 発行完了！
                  </p>
                  <div className="flex flex-col gap-2">
                    <a
                      href={issueResult.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                    >
                      請求書を開く →
                    </a>
                    <Link
                      href="/accounts-receivable"
                      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      売掛金一覧で確認 →
                    </Link>
                  </div>
                </div>
              ) : (
                /* 発行フォーム */
                <div className="space-y-4">
                  {/* 対象月 */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      対象月 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={issueMonth}
                      onChange={e => setIssueMonth(e.target.value)}
                      disabled={issuing}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
                    >
                      {monthOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 金額 */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      金額（税抜）
                      {billingType === 'VARIABLE' && (
                        <span className="text-red-500 ml-1">必須</span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">¥</span>
                      <input
                        type="number"
                        value={issueAmount}
                        onChange={e => setIssueAmount(e.target.value)}
                        disabled={issuing}
                        min="0"
                        placeholder={
                          billingType === 'VARIABLE'
                            ? '金額を入力'
                            : String(fixedAmount ?? 0)
                        }
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
                      />
                    </div>
                    {billingType === 'FIXED' && (
                      <p className="text-xs text-gray-400 mt-1">
                        初期値は固定金額。変更可能です。
                      </p>
                    )}
                  </div>

                  {/* エラー */}
                  {issueError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {issueError}
                    </p>
                  )}

                  <p className="text-xs text-gray-400">
                    ※ 発行と同時にDriveに請求書が作成され、売掛金にも自動登録されます
                  </p>
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              {issueResult ? (
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  閉じる
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setOpen(false)}
                    disabled={issuing}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleIssue}
                    disabled={issuing}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {issuing ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        発行中...
                      </>
                    ) : (
                      '請求書を発行'
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
