'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type MeetingType = 'online' | 'offline'

function buildDefaultTitle(contact: { name: string; company?: string | null }): string {
  const name = contact.name?.trim()
  const company = contact.company?.trim()
  if (company && name) return `打ち合わせ　${company}　${name}様`
  if (company) return `打ち合わせ　${company}様`
  return `打ち合わせ　${name}様`
}

export default function ScheduleMeetingModal({
  contact,
  open,
  onClose,
}: {
  contact: { id: string; name: string; email?: string | null; company?: string | null; owner?: string | null }
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()

  // デフォルト: 翌営業日 10:00 JST
  const getDefaultDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    // toISOString() は UTC を返すので JST に調整
    const tz = d.getTimezoneOffset() * 60000
    const jst = new Date(d.getTime() - tz)
    return jst.toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
  }

  const [form, setForm] = useState({
    title: buildDefaultTitle(contact),
    date: getDefaultDate(),
    duration: 60,
    description: '',
    location: '',
    meetingType: 'online' as MeetingType,
    inviteParticipants: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ meetUrl: string | null; htmlLink: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/meetings/schedule-with-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: [contact.id],
          title: form.title,
          // datetime-local は JST 前提で送る（APIでnew Dateする）
          date: new Date(form.date).toISOString(),
          duration: Number(form.duration),
          description: form.description,
          location: form.meetingType === 'offline' ? form.location : undefined,
          meetingType: form.meetingType,
          inviteParticipants: form.inviteParticipants,
          owner: contact.owner || 'KAZUI',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '作成に失敗しました')
        return
      }
      setResult({
        meetUrl: data.googleEvent?.meetUrl || null,
        htmlLink: data.googleEvent?.htmlLink || null,
      })
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '通信エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!result?.meetUrl) return
    try {
      await navigator.clipboard.writeText(result.meetUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API が使えない場合のフォールバック
      const el = document.createElement('textarea')
      el.value = result.meetUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isOffline = form.meetingType === 'offline'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {result ? (
          /* 作成完了画面 */
          <div className="p-6 text-center">
            <div className="text-5xl mb-3">📅</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">打ち合わせを作成しました</h2>
            <p className="text-sm text-gray-500 mb-5">Googleカレンダーに登録されました</p>
            <div className="space-y-2 mb-5">
              {result.meetUrl && (
                <>
                  <a
                    href={result.meetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm"
                  >
                    🎥 Google Meet を開く
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="block w-full py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg font-medium text-sm border border-emerald-200"
                  >
                    {copied ? '✅ コピーしました' : '📋 Meet URL をコピー'}
                  </button>
                </>
              )}
              {result.htmlLink && (
                <a
                  href={result.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm"
                >
                  📅 Googleカレンダーで確認
                </a>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : (
          /* 入力画面 */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">📅 打ち合わせをスケジュール</h2>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">
              参加者: <strong>{contact.name}</strong>
              {contact.company && <span className="text-blue-700 ml-1">（{contact.company}）</span>}
              {contact.email && <div className="text-xs text-blue-600 mt-0.5">📧 {contact.email}</div>}
            </div>

            {/* 打ち合わせタイプ切替 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">打ち合わせ形式 *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, meetingType: 'online' }))}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition ${
                    !isOffline
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  🎥 オンライン（Meet）
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, meetingType: 'offline' }))}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition ${
                    isOffline
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  🏢 対面（場所指定）
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">タイトル *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isOffline && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">場所 *</label>
                <input
                  type="text"
                  required={isOffline}
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="例: 弊社オフィス / 〇〇ビル1Fカフェ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">日時 *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">長さ (分)</label>
                <select
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value={15}>15分</option>
                  <option value={30}>30分</option>
                  <option value={45}>45分</option>
                  <option value={60}>60分</option>
                  <option value={90}>90分</option>
                  <option value={120}>120分</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">詳細メモ（任意）</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="打ち合わせのアジェンダ、準備事項など..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.inviteParticipants}
                onChange={e => setForm(f => ({ ...f, inviteParticipants: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                参加者にメールで招待を送る
                {!contact.email && (
                  <span className="block text-xs text-orange-600 mt-0.5">
                    ⚠️ この方のメールが未登録なので招待は送られません
                  </span>
                )}
              </span>
            </label>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                ❌ {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm"
              >
                {loading ? '作成中...' : isOffline ? '🏢 対面打ち合わせを作成' : '🎥 Meet付きで作成'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                キャンセル
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
