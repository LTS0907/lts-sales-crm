'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface BillingRecord {
  id: string
  billingMonth: string
  amount: number | null
  amountConfirmed: boolean
  status: string
  spreadsheetId: string | null
  spreadsheetUrl: string | null
  generatedAt: string | null
  sentAt: string | null
  sentMethod: string | null
  errorMessage: string | null
}

interface Subscription {
  id: string
  contactId: string
  serviceName: string
  billingType: string
  billingCycle: string
  fixedAmount: number | null
  description: string
  invoiceSubject: string
  status: string
  startDate: string
  endDate: string | null
  notes: string | null
  Contact: { id: string; name: string; company: string | null; email: string | null }
  BillingRecord: BillingRecord[]
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const billingStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  GENERATED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  DOWNLOADED: 'bg-purple-100 text-purple-700',
}

// 日付文字列を "YYYY-MM-DD" 形式に変換（input[type=date] 用）
function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 日付文字列を "YYYY年MM月DD日" 形式で表示
function formatDateJa(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ja-JP')
}

// 編集ペンシルアイコン
function EditIcon() {
  return (
    <svg className="inline w-3.5 h-3.5 ml-1 text-gray-400 hover:text-blue-500 cursor-pointer" viewBox="0 0 20 20" fill="currentColor">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.793 8.793a2 2 0 01-.89.524l-2.828.707.707-2.828a2 2 0 01.524-.89l8.452-8.124z" />
    </svg>
  )
}

export default function SubscriptionDetailClient({ subscription: initialSub }: { subscription: Subscription }) {
  const router = useRouter()
  const [sub, setSub] = useState(initialSub)
  // どのフィールドを編集中か。null = 非編集
  const [editingField, setEditingField] = useState<string | null>(null)
  // 編集中の一時的な値
  const [draftValue, setDraftValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // フィールドの編集開始
  function startEdit(field: string, currentValue: string) {
    setEditingField(field)
    setDraftValue(currentValue)
    setSaveError(null)
  }

  // 編集キャンセル
  function cancelEdit() {
    setEditingField(null)
    setDraftValue('')
    setSaveError(null)
  }

  // フィールドを保存する汎用関数
  async function saveField(field: string, value: unknown) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveError(err.error || '保存に失敗しました')
        return false
      }
      const updated = await res.json()
      // BillingRecord は PATCH レスポンスに含まれないため既存を維持してマージ
      setSub(prev => ({
        ...prev,
        ...updated,
        Contact: updated.Contact,
        BillingRecord: prev.BillingRecord,
      }))
      setEditingField(null)
      setDraftValue('')
      router.refresh()
      return true
    } finally {
      setSaving(false)
    }
  }

  // startDate / billingCycle など警告が必要なフィールドの保存
  async function saveWithConfirm(field: string, value: unknown, warningMsg: string) {
    if (!confirm(warningMsg)) return
    await saveField(field, value)
  }

  // billingType 変更: FIXED↔VARIABLE の特殊処理
  async function saveBillingType(newType: string) {
    let body: Record<string, unknown> = { billingType: newType }
    if (newType === 'VARIABLE') {
      // fixedAmount を null にする（サーバー側でも処理するが UI も即反映）
      body = { billingType: 'VARIABLE', fixedAmount: null }
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveError(err.error || '保存に失敗しました')
        return
      }
      const updated = await res.json()
      setSub(prev => ({
        ...prev,
        ...updated,
        Contact: updated.Contact,
        BillingRecord: prev.BillingRecord,
      }))
      setEditingField(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // status 変更（一時停止・解約・再開）
  async function handleStatusChange(newStatus: string) {
    if (newStatus === 'CANCELLED' && !confirm('本当に解約しますか？')) return
    const res = await fetch(`/api/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSub(prev => ({
        ...prev,
        ...updated,
        Contact: updated.Contact,
        BillingRecord: prev.BillingRecord,
      }))
      router.refresh()
    }
  }

  const canEdit = sub.status !== 'CANCELLED'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* サービス名 */}
            {editingField === 'serviceName' ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  value={draftValue}
                  onChange={e => setDraftValue(e.target.value)}
                  className="text-lg font-bold border border-gray-300 rounded px-2 py-1 w-72"
                  autoFocus
                />
                <button onClick={() => saveField('serviceName', draftValue)} disabled={saving}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50">保存</button>
                <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
              </div>
            ) : (
              <h1 className="text-lg font-bold text-gray-900">
                {sub.serviceName}
                {canEdit && (
                  <span onClick={() => startEdit('serviceName', sub.serviceName)}>
                    <EditIcon />
                  </span>
                )}
              </h1>
            )}
            <Link href={`/contacts/${sub.Contact.id}`} className="text-sm text-blue-600 hover:underline">
              {sub.Contact.name} {sub.Contact.company && `(${sub.Contact.company})`}
            </Link>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ml-4 ${statusColors[sub.status] || ''}`}>
            {sub.status === 'ACTIVE' ? '有効' : sub.status === 'PAUSED' ? '一時停止' : '解約済'}
          </span>
        </div>

        {/* エラー表示 */}
        {saveError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">{saveError}</p>
        )}

        {/* グリッド情報 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">

          {/* 請求種別 */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">請求種別</p>
            {editingField === 'billingType' ? (
              <div className="flex flex-col gap-1">
                <select
                  value={draftValue}
                  onChange={e => setDraftValue(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                  autoFocus
                >
                  <option value="FIXED">固定額</option>
                  <option value="VARIABLE">変動額</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (draftValue === 'VARIABLE' && sub.billingType === 'FIXED') {
                        if (!confirm('変動額に変更すると固定金額がクリアされます。よろしいですか？')) return
                      }
                      await saveBillingType(draftValue)
                    }}
                    disabled={saving}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >保存</button>
                  <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium">
                {sub.billingType === 'FIXED' ? '固定額' : '変動額'}
                {canEdit && (
                  <span onClick={() => startEdit('billingType', sub.billingType)}>
                    <EditIcon />
                  </span>
                )}
              </p>
            )}
          </div>

          {/* 請求サイクル */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">請求サイクル</p>
            {editingField === 'billingCycle' ? (
              <div className="flex flex-col gap-1">
                <select
                  value={draftValue}
                  onChange={e => setDraftValue(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
                  autoFocus
                >
                  <option value="MONTHLY">月次</option>
                  <option value="YEARLY">年次</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const oldLabel = sub.billingCycle === 'MONTHLY' ? '月次' : '年次'
                      const newLabel = draftValue === 'MONTHLY' ? '月次' : '年次'
                      if (draftValue !== sub.billingCycle) {
                        if (!confirm(`請求サイクルを ${oldLabel} → ${newLabel} に変更します。\n請求バッチの動作が変わります。よろしいですか？`)) return
                      }
                      await saveField('billingCycle', draftValue)
                    }}
                    disabled={saving}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >保存</button>
                  <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
                </div>
              </div>
            ) : (
              <div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block ${
                  sub.billingCycle === 'YEARLY' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {sub.billingCycle === 'YEARLY' ? '年次' : '月次'}
                </span>
                {canEdit && (
                  <span onClick={() => startEdit('billingCycle', sub.billingCycle)}>
                    <EditIcon />
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 固定金額（FIXED の場合のみ） */}
          {sub.billingType === 'FIXED' && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">
                {sub.billingCycle === 'YEARLY' ? '年額（税抜）' : '月額（税抜）'}
              </p>
              {editingField === 'fixedAmount' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={draftValue}
                    onChange={e => setDraftValue(e.target.value)}
                    className="w-28 border border-gray-300 rounded px-2 py-1 text-sm"
                    autoFocus
                    min="0"
                  />
                  <button
                    onClick={() => saveField('fixedAmount', parseInt(draftValue) || 0)}
                    disabled={saving}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >保存</button>
                  <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
                </div>
              ) : (
                <p className="text-sm font-medium">
                  ¥{(sub.fixedAmount || 0).toLocaleString()}
                  {canEdit && (
                    <span onClick={() => startEdit('fixedAmount', String(sub.fixedAmount || ''))}>
                      <EditIcon />
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* 開始日 */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">開始日</p>
            {editingField === 'startDate' ? (
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={draftValue}
                  onChange={e => setDraftValue(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const oldDate = formatDateJa(sub.startDate)
                      const newDate = draftValue ? new Date(draftValue + 'T00:00:00+09:00').toLocaleDateString('ja-JP') : draftValue
                      if (draftValue !== toDateInputValue(sub.startDate)) {
                        saveWithConfirm(
                          'startDate',
                          draftValue,
                          `請求開始日を ${oldDate} → ${newDate} に変更します。\n請求バッチの動作が変わります。よろしいですか？`
                        )
                      } else {
                        cancelEdit()
                      }
                    }}
                    disabled={saving}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >保存</button>
                  <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium">
                {formatDateJa(sub.startDate)}
                {canEdit && (
                  <span onClick={() => startEdit('startDate', toDateInputValue(sub.startDate))}>
                    <EditIcon />
                  </span>
                )}
              </p>
            )}
          </div>

          {/* 終了日 */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">終了日</p>
            {editingField === 'endDate' ? (
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={draftValue}
                  onChange={e => setDraftValue(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
                  autoFocus
                />
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => saveField('endDate', draftValue || null)}
                    disabled={saving}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >保存</button>
                  <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
                  {draftValue && (
                    <button
                      onClick={() => setDraftValue('')}
                      className="text-xs text-red-400 hover:underline"
                    >クリア</button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium">
                {sub.endDate ? formatDateJa(sub.endDate) : '—'}
                {canEdit && (
                  <span onClick={() => startEdit('endDate', toDateInputValue(sub.endDate))}>
                    <EditIcon />
                  </span>
                )}
              </p>
            )}
          </div>

          {/* メール */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">メール</p>
            <p className="text-sm">{sub.Contact.email || '未登録'}</p>
          </div>
        </div>

        {/* 説明文 */}
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-0.5">
            説明
            {canEdit && editingField !== 'description' && (
              <span onClick={() => startEdit('description', sub.description)}>
                <EditIcon />
              </span>
            )}
          </p>
          {editingField === 'description' ? (
            <div className="flex flex-col gap-1">
              <textarea
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => saveField('description', draftValue)} disabled={saving}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50">保存</button>
                <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{sub.description || '—'}</p>
          )}
        </div>

        {/* 請求書件名 */}
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-0.5">
            請求書件名
            {canEdit && editingField !== 'invoiceSubject' && (
              <span onClick={() => startEdit('invoiceSubject', sub.invoiceSubject)}>
                <EditIcon />
              </span>
            )}
          </p>
          {editingField === 'invoiceSubject' ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-80"
                autoFocus
              />
              <button onClick={() => saveField('invoiceSubject', draftValue)} disabled={saving}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50">保存</button>
              <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
            </div>
          ) : (
            <p className="text-sm text-gray-700">{sub.invoiceSubject || '—'}</p>
          )}
        </div>

        {/* メモ */}
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-0.5">
            メモ
            {canEdit && editingField !== 'notes' && (
              <span onClick={() => startEdit('notes', sub.notes || '')}>
                <EditIcon />
              </span>
            )}
          </p>
          {editingField === 'notes' ? (
            <div className="flex flex-col gap-1">
              <textarea
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                rows={3}
                autoFocus
                placeholder="メモを入力..."
              />
              <div className="flex gap-2">
                <button onClick={() => saveField('notes', draftValue || null)} disabled={saving}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50">保存</button>
                <button onClick={cancelEdit} className="text-xs text-gray-400 hover:underline">取消</button>
              </div>
            </div>
          ) : (
            sub.notes ? (
              <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded">{sub.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">（なし）</p>
            )
          )}
        </div>

        {/* 一時停止 / 解約 / 再開ボタン */}
        {sub.status === 'ACTIVE' && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => handleStatusChange('PAUSED')}
              className="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-50">
              一時停止
            </button>
            <button onClick={() => handleStatusChange('CANCELLED')}
              className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
              解約
            </button>
          </div>
        )}
        {sub.status === 'PAUSED' && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => handleStatusChange('ACTIVE')}
              className="text-xs px-3 py-1.5 border border-green-300 text-green-700 rounded-lg hover:bg-green-50">
              再開する
            </button>
          </div>
        )}
      </div>

      {/* 請求履歴 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">請求履歴</h2>
        </div>
        {sub.BillingRecord.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">まだ請求レコードはありません</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">月</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">金額</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">ステータス</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">送信</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {sub.BillingRecord.map(br => (
                <tr key={br.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-sm font-medium">{br.billingMonth}</td>
                  <td className="px-4 py-2 text-sm text-right">
                    {br.amount != null ? `¥${br.amount.toLocaleString()}` : <span className="text-orange-500">未入力</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${billingStatusColors[br.status] || 'bg-gray-100'}`}>
                      {br.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {br.sentAt ? `${new Date(br.sentAt).toLocaleDateString('ja-JP')} (${br.sentMethod})` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {br.spreadsheetUrl && (
                      <a href={br.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline">開く</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
