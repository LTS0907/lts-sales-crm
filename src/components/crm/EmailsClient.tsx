'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'

// ステータス定義
const STATUSES = [
  { value: 'UNSENT', label: '未送信', color: 'bg-gray-100 text-gray-600' },
  { value: 'DRAFTED', label: '下書き', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'APPROVED', label: '送信許可', color: 'bg-blue-100 text-blue-700' },
  { value: 'SENT', label: '送信済み', color: 'bg-green-100 text-green-700' },
]

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]))

// フィルタタブ定義
const FILTER_TABS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'UNSENT', label: '未送信' },
  { value: 'DRAFTED', label: '下書き' },
  { value: 'APPROVED', label: '送信許可' },
  { value: 'SENT', label: '送信済み' },
]

interface ContactEmail {
  id: string
  name: string
  company?: string | null
  email?: string | null
  emailStatus: string
  emailSubject?: string | null
  emailBody?: string | null
  episodeMemo?: string | null
}

// メールプレビューモーダル
interface EmailPreviewModalProps {
  contact: ContactEmail
  onClose: () => void
  onGenerate: (id: string) => Promise<void>
  onApprove: (id: string) => Promise<void>
  onSend: (id: string) => Promise<void>
  isGenerating: boolean
  isApproving: boolean
  isSending: boolean
}

function EmailPreviewModal({
  contact,
  onClose,
  onGenerate,
  onApprove,
  onSend,
  isGenerating,
  isApproving,
  isSending,
}: EmailPreviewModalProps) {
  const isProcessing = isGenerating || isApproving || isSending
  const statusDef = STATUS_MAP[contact.emailStatus] ?? STATUSES[0]

  // ESCキーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // body のスクロールを禁止
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleAction = async (fn: (id: string) => Promise<void>) => {
    await fn(contact.id)
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
        onClick={onClose}
        aria-hidden="true"
      />

      {/* モーダル本体 */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ animation: 'slideUp 0.15s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label="メール内容プレビュー"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">メール内容プレビュー</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1 -mr-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* スクロール可能な本文エリア */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 受信者情報 */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium w-6">To:</span>
              <span className="text-sm text-gray-900 font-medium">{contact.name} 様</span>
              {contact.company && (
                <span className="text-xs text-gray-500">({contact.company})</span>
              )}
              {contact.email && (
                <span className="text-xs text-gray-400">&lt;{contact.email}&gt;</span>
              )}
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${statusDef.color}`}>
                {statusDef.label}
              </span>
            </div>
          </div>

          {/* 件名 */}
          {contact.emailSubject ? (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">件名</p>
              <p className="text-base font-semibold text-gray-900">{contact.emailSubject}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">件名未生成</p>
          )}

          {/* 本文 */}
          {contact.emailBody ? (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">本文</p>
              <div className="border border-gray-100 rounded-xl px-4 py-3 bg-white">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {contact.emailBody}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">本文未生成</p>
          )}

          {/* episodeMemo */}
          {contact.episodeMemo && (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">メモ・記録</p>
              <p className="text-xs text-gray-500 whitespace-pre-wrap bg-yellow-50 rounded-lg px-3 py-2">
                {contact.episodeMemo}
              </p>
            </div>
          )}
        </div>

        {/* フッター（アクションボタン） */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 flex-wrap">
          {contact.emailStatus === 'DRAFTED' && (
            <>
              <button
                onClick={() => handleAction(onGenerate)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '生成中...' : '✨ 再生成'}
              </button>
              <button
                onClick={() => handleAction(onApprove)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isApproving ? '処理中...' : '✅ 送信許可'}
              </button>
            </>
          )}
          {contact.emailStatus === 'APPROVED' && (
            <>
              <button
                onClick={() => handleAction(onGenerate)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '生成中...' : '✨ 再生成'}
              </button>
              <button
                onClick={() => handleAction(onSend)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? '送信中...' : '📧 Gmailで送信'}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// 処理中状態
type ProcessingState = {
  generating: Set<string>
  approving: Set<string>
  sending: Set<string>
}

// 並列数制限付き実行ヘルパー
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    await Promise.all(chunk.map(fn))
  }
}

export default function EmailsClient({ contacts: initial }: { contacts: ContactEmail[] }) {
  const [contacts, setContacts] = useState<ContactEmail[]>(initial)
  const [filter, setFilter] = useState<string>('UNSENT')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState<ProcessingState>({
    generating: new Set(),
    approving: new Set(),
    sending: new Set(),
  })
  const [cardErrors, setCardErrors] = useState<Map<string, string>>(new Map())
  const [memoSaving, setMemoSaving] = useState<Set<string>>(new Set())
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; type: string } | null>(null)
  const [bulkSummary, setBulkSummary] = useState<{ success: number; fail: number; type: string } | null>(null)
  const [previewContactId, setPreviewContactId] = useState<string | null>(null)
  const memoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // フィルタ済みリスト
  const filtered = filter === 'ALL' ? contacts : contacts.filter(c => c.emailStatus === filter)

  // カウント取得
  const countOf = (status: string) =>
    status === 'ALL' ? contacts.length : contacts.filter(c => c.emailStatus === status).length

  // Contact 更新ヘルパー
  const updateContact = useCallback((id: string, patch: Partial<ContactEmail>) => {
    setContacts(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  // カードエラーをセット / クリア
  const setCardError = (id: string, msg: string | null) => {
    setCardErrors(prev => {
      const next = new Map(prev)
      if (msg) next.set(id, msg)
      else next.delete(id)
      return next
    })
  }

  // 処理中フラグを追加 / 削除
  const addProcessing = (type: keyof ProcessingState, id: string) => {
    setProcessing(prev => {
      const next = { ...prev, [type]: new Set(prev[type]).add(id) }
      return next
    })
  }
  const removeProcessing = (type: keyof ProcessingState, id: string) => {
    setProcessing(prev => {
      const s = new Set(prev[type])
      s.delete(id)
      return { ...prev, [type]: s }
    })
  }

  // --- episodeMemo 自動保存 ---
  const handleMemoChange = (id: string, value: string) => {
    updateContact(id, { episodeMemo: value })
    // デバウンス: 1秒後に保存
    const existing = memoTimers.current.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      memoTimers.current.delete(id)
      setMemoSaving(prev => new Set(prev).add(id))
      try {
        await fetch(`/api/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeMemo: value }),
        })
      } finally {
        setMemoSaving(prev => {
          const s = new Set(prev)
          s.delete(id)
          return s
        })
      }
    }, 1000)
    memoTimers.current.set(id, timer)
  }

  // --- 個別: AI生成 ---
  const generateEmail = async (id: string) => {
    const contact = contacts.find(c => c.id === id)
    if (!contact) return
    if (!contact.episodeMemo?.trim()) {
      if (!confirm(`${contact.name} さんのepisodeMemoが空です。空のまま生成しますか？`)) return
    }
    setCardError(id, null)
    addProcessing('generating', id)
    try {
      const res = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCardError(id, `生成失敗: ${data.error || '不明なエラー'}`)
      } else {
        updateContact(id, {
          emailStatus: 'DRAFTED',
          emailSubject: data.subject,
          emailBody: data.body,
        })
      }
    } catch (err) {
      setCardError(id, `通信エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      removeProcessing('generating', id)
    }
  }

  // --- 個別: 送信許可 ---
  const approve = async (id: string) => {
    setCardError(id, null)
    addProcessing('approving', id)
    const prev = contacts.find(c => c.id === id)?.emailStatus
    updateContact(id, { emailStatus: 'APPROVED' })
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailStatus: 'APPROVED' }),
      })
      if (!res.ok) {
        updateContact(id, { emailStatus: prev ?? 'DRAFTED' })
        setCardError(id, '送信許可の更新に失敗しました')
      }
    } catch (err) {
      updateContact(id, { emailStatus: prev ?? 'DRAFTED' })
      setCardError(id, `通信エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      removeProcessing('approving', id)
    }
  }

  // --- 個別: Gmail送信 ---
  const sendViaGmail = async (id: string) => {
    setCardError(id, null)
    addProcessing('sending', id)
    const prev = contacts.find(c => c.id === id)?.emailStatus
    updateContact(id, { emailStatus: 'SENT' })
    try {
      const res = await fetch(`/api/contacts/${id}/send-email`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        updateContact(id, { emailStatus: prev ?? 'APPROVED' })
        if (res.status === 403 && data.code === 'INSUFFICIENT_SCOPE') {
          setCardError(id, 'Gmail送信権限なし。再ログインしてください')
        } else {
          setCardError(id, `送信失敗: ${data.error || '不明なエラー'}`)
        }
      }
    } catch (err) {
      updateContact(id, { emailStatus: prev ?? 'APPROVED' })
      setCardError(id, `通信エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      removeProcessing('sending', id)
    }
  }

  // --- 選択管理 ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(filtered.map(c => c.id)))
  const clearSelection = () => setSelectedIds(new Set())

  // 選択中の各ステータス別リスト
  const selectedContacts = contacts.filter(c => selectedIds.has(c.id))
  const selectedDrafted = selectedContacts.filter(c => c.emailStatus === 'DRAFTED')
  const selectedApproved = selectedContacts.filter(c => c.emailStatus === 'APPROVED')

  // 一括AI生成の対象（UNSENT のみ、episodeMemoあり優先）
  const bulkGenerateTargets = selectedContacts.filter(c => c.emailStatus === 'UNSENT')

  // --- 一括: AI生成 ---
  const bulkGenerate = async () => {
    if (bulkGenerateTargets.length === 0) return
    const hasEmpty = bulkGenerateTargets.some(c => !c.episodeMemo?.trim())
    if (hasEmpty) {
      const ok = confirm(`選択中 ${bulkGenerateTargets.length} 件のうち episodeMemo が空の名刺があります。空のまま生成しますか？`)
      if (!ok) return
    }
    setBulkSummary(null)
    let done = 0
    let success = 0
    let fail = 0
    const total = bulkGenerateTargets.length
    setBulkProgress({ done: 0, total, type: 'AI生成' })
    bulkGenerateTargets.forEach(c => addProcessing('generating', c.id))

    await runConcurrent(bulkGenerateTargets, 3, async (c) => {
      try {
        const res = await fetch('/api/ai/generate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: c.id }),
        })
        const data = await res.json()
        if (!res.ok) {
          setCardError(c.id, `生成失敗: ${data.error || '不明'}`)
          fail++
        } else {
          updateContact(c.id, { emailStatus: 'DRAFTED', emailSubject: data.subject, emailBody: data.body })
          setCardError(c.id, null)
          success++
        }
      } catch (err) {
        setCardError(c.id, `通信エラー: ${err instanceof Error ? err.message : String(err)}`)
        fail++
      } finally {
        removeProcessing('generating', c.id)
        done++
        setBulkProgress({ done, total, type: 'AI生成' })
      }
    })

    setBulkProgress(null)
    setBulkSummary({ success, fail, type: 'AI生成' })
  }

  // --- 一括: 送信許可 ---
  const bulkApprove = async () => {
    if (selectedDrafted.length === 0) return
    setBulkSummary(null)
    let done = 0
    let success = 0
    let fail = 0
    const total = selectedDrafted.length
    setBulkProgress({ done: 0, total, type: '送信許可' })
    selectedDrafted.forEach(c => addProcessing('approving', c.id))

    await runConcurrent(selectedDrafted, 3, async (c) => {
      const prev = c.emailStatus
      updateContact(c.id, { emailStatus: 'APPROVED' })
      try {
        const res = await fetch(`/api/contacts/${c.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailStatus: 'APPROVED' }),
        })
        if (!res.ok) {
          updateContact(c.id, { emailStatus: prev })
          fail++
        } else {
          success++
        }
      } catch {
        updateContact(c.id, { emailStatus: prev })
        fail++
      } finally {
        removeProcessing('approving', c.id)
        done++
        setBulkProgress({ done, total, type: '送信許可' })
      }
    })

    setBulkProgress(null)
    setBulkSummary({ success, fail, type: '送信許可' })
  }

  // --- 一括: 送信 ---
  const bulkSend = async () => {
    if (selectedApproved.length === 0) return
    if (!confirm(`${selectedApproved.length} 件をGmailで送信します。よろしいですか？`)) return
    setBulkSummary(null)
    let done = 0
    let success = 0
    let fail = 0
    const total = selectedApproved.length
    setBulkProgress({ done: 0, total, type: 'Gmail送信' })
    selectedApproved.forEach(c => addProcessing('sending', c.id))

    await runConcurrent(selectedApproved, 3, async (c) => {
      const prev = c.emailStatus
      updateContact(c.id, { emailStatus: 'SENT' })
      try {
        const res = await fetch(`/api/contacts/${c.id}/send-email`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) {
          updateContact(c.id, { emailStatus: prev })
          if (res.status === 403 && data.code === 'INSUFFICIENT_SCOPE') {
            setCardError(c.id, 'Gmail権限なし: 再ログインしてください')
          } else {
            setCardError(c.id, `送信失敗: ${data.error || '不明'}`)
          }
          fail++
        } else {
          setCardError(c.id, null)
          success++
        }
      } catch (err) {
        updateContact(c.id, { emailStatus: prev })
        setCardError(c.id, `通信エラー: ${err instanceof Error ? err.message : String(err)}`)
        fail++
      } finally {
        removeProcessing('sending', c.id)
        done++
        setBulkProgress({ done, total, type: 'Gmail送信' })
      }
    })

    setBulkProgress(null)
    setBulkSummary({ success, fail, type: 'Gmail送信' })
  }

  const isAnyProcessing =
    processing.generating.size > 0 ||
    processing.approving.size > 0 ||
    processing.sending.size > 0

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">メール一括処理</h1>

      {/* フィルタタブ */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setFilter(tab.value); clearSelection() }}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filter === tab.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label} ({countOf(tab.value)})
          </button>
        ))}
      </div>

      {/* 一括処理バー */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 bg-white border border-gray-200 rounded-xl p-3 mb-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700 mr-1">
              選択中: {selectedIds.size} 件
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-blue-600 hover:underline"
            >
              全選択
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={clearSelection}
              className="text-xs text-gray-500 hover:underline"
            >
              解除
            </button>

            <div className="flex flex-wrap gap-2 ml-auto">
              {/* 一括AI生成 */}
              <button
                onClick={bulkGenerate}
                disabled={bulkGenerateTargets.length === 0 || isAnyProcessing}
                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ✨ 一括AI生成 ({bulkGenerateTargets.length}件)
              </button>
              {/* 一括送信許可 */}
              <button
                onClick={bulkApprove}
                disabled={selectedDrafted.length === 0 || isAnyProcessing}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ✅ 一括送信許可 ({selectedDrafted.length}件)
              </button>
              {/* 一括送信 */}
              <button
                onClick={bulkSend}
                disabled={selectedApproved.length === 0 || isAnyProcessing}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                📧 一括送信 ({selectedApproved.length}件)
              </button>
            </div>
          </div>

          {/* 進捗バー */}
          {bulkProgress && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{bulkProgress.type} 処理中...</span>
                <span>{bulkProgress.done} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 全選択リンク（一括バー非表示時も使える） */}
      {selectedIds.size === 0 && filtered.length > 0 && (
        <div className="flex gap-3 mb-3 text-xs">
          <button onClick={selectAll} className="text-blue-600 hover:underline">
            {filtered.length} 件をすべて選択
          </button>
        </div>
      )}

      {/* バルクサマリトースト */}
      {bulkSummary && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
          bulkSummary.fail === 0 ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
        }`}>
          <span>
            {bulkSummary.type}: {bulkSummary.success} 件成功
            {bulkSummary.fail > 0 && ` · ${bulkSummary.fail} 件失敗`}
          </span>
          <button onClick={() => setBulkSummary(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* メールプレビューモーダル */}
      {previewContactId && (() => {
        const previewContact = contacts.find(c => c.id === previewContactId)
        if (!previewContact) return null
        return (
          <EmailPreviewModal
            contact={previewContact}
            onClose={() => setPreviewContactId(null)}
            onGenerate={generateEmail}
            onApprove={approve}
            onSend={sendViaGmail}
            isGenerating={processing.generating.has(previewContactId)}
            isApproving={processing.approving.has(previewContactId)}
            isSending={processing.sending.has(previewContactId)}
          />
        )
      })()}

      {/* カードリスト */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-3">📭</p>
          <p>該当する連絡先はありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const statusDef = STATUS_MAP[c.emailStatus] ?? STATUSES[0]
            const isGenerating = processing.generating.has(c.id)
            const isApproving = processing.approving.has(c.id)
            const isSending = processing.sending.has(c.id)
            const isProcessingCard = isGenerating || isApproving || isSending
            const cardError = cardErrors.get(c.id)
            const isMemoSaving = memoSaving.has(c.id)
            const isSelected = selectedIds.has(c.id)

            return (
              <div
                key={c.id}
                className={`bg-white border rounded-xl p-3 sm:p-4 transition-colors ${
                  isSelected ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'
                } ${isProcessingCard ? 'opacity-75' : ''}`}
              >
                {/* カードヘッダー */}
                <div className="flex items-start gap-3">
                  {/* チェックボックス */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(c.id)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <Link
                          href={`/contacts/${c.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600 text-sm"
                        >
                          {c.name}
                        </Link>
                        {c.company && (
                          <span className="text-xs text-gray-500 ml-2">{c.company}</span>
                        )}
                        {c.email && (
                          <span className="text-xs text-gray-400 ml-2 hidden sm:inline">{c.email}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isProcessingCard && (
                          <span className="text-xs text-gray-400">
                            {isGenerating && '⏳ 生成中'}
                            {isApproving && '⏳ 許可中'}
                            {isSending && '⏳ 送信中'}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${statusDef.color}`}>
                          {statusDef.label}
                        </span>
                      </div>
                    </div>

                    {/* episodeMemo 入力欄 */}
                    <div className="mb-2">
                      <div className="relative">
                        <textarea
                          rows={2}
                          value={c.episodeMemo ?? ''}
                          onChange={e => handleMemoChange(c.id, e.target.value)}
                          placeholder="出会い・コメント（例: 2月例会で名刺交換）"
                          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
                        />
                        {isMemoSaving && (
                          <span className="absolute top-1.5 right-2 text-xs text-gray-400">保存中...</span>
                        )}
                      </div>
                    </div>

                    {/* メール内容（DRAFTED/APPROVED/SENTのみ） */}
                    {c.emailStatus !== 'UNSENT' && (
                      <div className="mb-2 bg-gray-50 rounded-lg px-3 py-2">
                        {c.emailSubject && (
                          <p className="text-xs font-medium text-gray-700 mb-0.5">{c.emailSubject}</p>
                        )}
                        {c.emailBody && (
                          <p className="text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap">{c.emailBody}</p>
                        )}
                      </div>
                    )}
                    {c.emailStatus === 'UNSENT' && (
                      <p className="text-xs text-gray-400 mb-2 italic">メール未生成</p>
                    )}

                    {/* エラー表示 */}
                    {cardError && (
                      <div className="mb-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1 flex items-start gap-1">
                        <span className="flex-shrink-0">⚠</span>
                        <span>{cardError}</span>
                        <button
                          onClick={() => setCardError(c.id, null)}
                          className="ml-auto text-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* アクションボタン */}
                    <div className="flex gap-2 flex-wrap">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="px-2.5 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                      >
                        詳細・編集
                      </Link>

                      {/* 本文確認ボタン（DRAFTED/APPROVED/SENT） */}
                      {c.emailStatus !== 'UNSENT' && (
                        <button
                          onClick={() => setPreviewContactId(c.id)}
                          className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          ✉️ 本文を見る
                        </button>
                      )}

                      {c.emailStatus === 'UNSENT' && (
                        <button
                          onClick={() => generateEmail(c.id)}
                          disabled={isProcessingCard}
                          className="px-2.5 py-1 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40"
                        >
                          {isGenerating ? '生成中...' : '✨ AIで生成'}
                        </button>
                      )}

                      {c.emailStatus === 'DRAFTED' && (
                        <>
                          <button
                            onClick={() => generateEmail(c.id)}
                            disabled={isProcessingCard}
                            className="px-2.5 py-1 text-xs border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-40"
                          >
                            {isGenerating ? '生成中...' : '✨ 再生成'}
                          </button>
                          <button
                            onClick={() => approve(c.id)}
                            disabled={isProcessingCard}
                            className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                          >
                            {isApproving ? '処理中...' : '✅ 送信許可'}
                          </button>
                        </>
                      )}

                      {c.emailStatus === 'APPROVED' && (
                        <>
                          <button
                            onClick={() => generateEmail(c.id)}
                            disabled={isProcessingCard}
                            className="px-2.5 py-1 text-xs border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-40"
                          >
                            {isGenerating ? '生成中...' : '✨ 再生成'}
                          </button>
                          <button
                            onClick={() => sendViaGmail(c.id)}
                            disabled={isProcessingCard}
                            className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40"
                          >
                            {isSending ? '送信中...' : '📧 Gmailで送信'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
