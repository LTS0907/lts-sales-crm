'use client'
import { useState, useEffect } from 'react'

interface Participant {
  contactId: string
  Contact: { id: string; name: string }
}

interface ActionItem {
  assignee: string
  title: string
  detail: string | null
}

interface MeetingRecord {
  id: string
  title: string | null
  date: string
  duration: number | null
  location: string | null
  meetUrl: string | null
  htmlLink: string | null
  minutesUrl: string | null
  minutesSummary: string | null
  minutesActionItems: ActionItem[] | null
  minutesTasksRegisteredAt: string | null
  assigneeStaffId: string | null
  status: string
  owner: string
  MeetingParticipant: Participant[]
}

// タスク登録用の編集状態
interface EditableSubtask {
  id: string // ローカルのみ（UUID）
  assignee: string
  title: string
  detail: string
  due: string
  checked: boolean
}

const OWNER_LABEL: Record<string, string> = {
  KAZUI: '龍竹一生',
  KABASHIMA: '樺嶋留奈',
  SHARED: '共有',
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

// 10営業日後の日付を YYYY-MM-DD で返す（簡易実装: 土日スキップ）
function defaultDueDate(): string {
  let d = new Date()
  let added = 0
  while (added < 10) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

// ActionItem[] → EditableSubtask[] に変換
function toEditableSubtasks(items: ActionItem[]): EditableSubtask[] {
  const due = defaultDueDate()
  return items.map((item, i) => ({
    id: `item-${i}`,
    assignee: item.assignee,
    title: `[${item.assignee}] ${item.title}`,
    detail: item.detail || '',
    due,
    checked: true,
  }))
}

function TaskCandidatePanel({
  meeting,
  contactId,
  onRegistered,
}: {
  meeting: MeetingRecord
  contactId: string
  onRegistered: () => void
}) {
  const items = meeting.minutesActionItems || []
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>(() =>
    toEditableSubtasks(items)
  )
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkedCount = subtasks.filter((s) => s.checked).length

  function toggleCheck(id: string) {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    )
  }

  function updateField(id: string, field: keyof EditableSubtask, value: string) {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    )
  }

  async function handleRegister() {
    const selected = subtasks.filter((s) => s.checked)
    if (selected.length === 0) {
      setError('登録するタスクを1つ以上チェックしてください')
      return
    }

    const participants = meeting.MeetingParticipant.map((p) => p.Contact.name).join('・')
    const dateStr = new Date(meeting.date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    })
    const parentTitle = `議事録: ${participants}様 (${dateStr})`

    setRegistering(true)
    setError(null)

    try {
      const res = await fetch(`/api/contacts/${contactId}/tasks/from-minutes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          parentTitle,
          subtasks: selected.map((s) => ({
            title: s.title,
            detail: s.detail || undefined,
            due: s.due || undefined,
          })),
        }),
      })

      if (res.status === 409) {
        setError('このミーティングのタスクはすでに登録済みです')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'タスク登録に失敗しました')
        return
      }

      onRegistered()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'タスク登録に失敗しました')
    } finally {
      setRegistering(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-600">アクションアイテムが抽出されていません</p>
      </div>
    )
  }

  return (
    <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
      {/* ヘッダ */}
      <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200">
        <p className="text-xs font-semibold text-blue-700">
          ✅ タスク候補 {items.length}件
          {checkedCount !== items.length && (
            <span className="ml-1 text-blue-500">（{checkedCount}件を選択中）</span>
          )}
        </p>
        <button
          onClick={handleRegister}
          disabled={registering || checkedCount === 0}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[28px]"
        >
          {registering ? '登録中...' : `Google Tasks に登録`}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* タスク一覧 */}
      <div className="divide-y divide-gray-100">
        {subtasks.map((sub) => (
          <div
            key={sub.id}
            className={`p-3 ${sub.checked ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
          >
            <div className="flex items-start gap-2">
              {/* チェックボックス */}
              <input
                type="checkbox"
                checked={sub.checked}
                onChange={() => toggleCheck(sub.id)}
                className="mt-0.5 w-4 h-4 rounded accent-blue-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* タイトル編集 */}
                <input
                  type="text"
                  value={sub.title}
                  onChange={(e) => updateField(sub.id, 'title', e.target.value)}
                  disabled={!sub.checked}
                  className="w-full text-xs font-medium text-gray-800 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-0 py-0.5 disabled:text-gray-400"
                />
                {/* 詳細 */}
                {sub.detail && (
                  <p className="text-xs text-gray-500 leading-relaxed">{sub.detail}</p>
                )}
                {/* 期限 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">期限:</span>
                  <input
                    type="date"
                    value={sub.due}
                    onChange={(e) => updateField(sub.id, 'due', e.target.value)}
                    disabled={!sub.checked}
                    className="text-xs text-gray-600 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none disabled:text-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* フッター */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-400">
          登録後: Google Tasks に親タスク「議事録: ...」+ サブタスク {checkedCount}件が作成されます
        </p>
      </div>
    </div>
  )
}

export default function ContactMinutesSection({ contactId }: { contactId: string }) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [taskPanelIds, setTaskPanelIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleTaskPanel(id: string) {
    setTaskPanelIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function fetchMeetings() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contacts/${contactId}/meetings`)
      if (!res.ok) throw new Error('打ち合わせ履歴の取得に失敗しました')
      const data: MeetingRecord[] = await res.json()
      setMeetings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMeetings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  const totalCount = meetings.length
  const minutesCount = meetings.filter((m) => m.minutesUrl).length

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm animate-pulse">
        打ち合わせ履歴を読み込み中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          議事録一覧
          <span className="ml-2 text-gray-800 font-semibold">{totalCount}件</span>
          {totalCount > 0 && (
            <span className="ml-1 text-gray-500">
              / うち議事録あり
              <span className="ml-1 text-blue-600 font-semibold">{minutesCount}件</span>
            </span>
          )}
        </p>
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="py-12 text-center text-gray-400 text-sm">
          <p className="text-3xl mb-3">📋</p>
          <p>打ち合わせ履歴がまだありません</p>
          <p className="text-xs mt-1">「📅 打ち合わせ」ボタンから予定を作成できます</p>
        </div>
      )}

      {/* Meeting cards */}
      <div className="space-y-3">
        {meetings.map((meeting) => {
          const hasMinutes = !!meeting.minutesUrl
          const hasSummary = !!meeting.minutesSummary
          const hasActionItems =
            Array.isArray(meeting.minutesActionItems) && meeting.minutesActionItems.length > 0
          const isTaskRegistered = !!meeting.minutesTasksRegisteredAt
          const isCancelled = meeting.status === 'CANCELLED'
          const isOnline = !!meeting.meetUrl
          const participants = meeting.MeetingParticipant.map((p) => p.Contact.name)
          const ownerLabel = OWNER_LABEL[meeting.owner] || meeting.owner
          const isExpanded = expandedIds.has(meeting.id)
          const isTaskPanelOpen = taskPanelIds.has(meeting.id)

          return (
            <div
              key={meeting.id}
              className={`rounded-xl border p-4 transition-colors ${
                isCancelled
                  ? 'bg-gray-50 border-gray-200 opacity-60'
                  : hasMinutes
                  ? 'bg-blue-50/40 border-blue-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              {/* Date row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-500">
                    {formatDate(meeting.date)} {formatTime(meeting.date)}
                  </span>
                  {isCancelled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                      キャンセル
                    </span>
                  )}
                  {hasMinutes && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      議事録あり
                    </span>
                  )}
                  {isTaskRegistered && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      ✅ タスク登録済み
                    </span>
                  )}
                </div>
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-gray-900 mb-2 leading-snug">
                {meeting.title || '（タイトルなし）'}
              </p>

              {/* Meta info */}
              <div className="space-y-1 text-xs text-gray-600 mb-3">
                <div className="flex items-center gap-4 flex-wrap">
                  {meeting.duration && (
                    <span className="flex items-center gap-1">
                      <span>📅</span>
                      <span>{meeting.duration}分</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {isOnline ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                        <span>オンライン</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                        <span>{meeting.location || '対面'}</span>
                      </>
                    )}
                  </span>
                </div>
                {participants.length > 0 && (
                  <div className="flex items-start gap-1">
                    <span className="flex-shrink-0">👥</span>
                    <span>{participants.join('、')}様</span>
                  </div>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1">
                    <span>👤</span>
                    <span>担当: {ownerLabel}</span>
                  </span>
                  <span className="flex items-center gap-1 text-gray-400">
                    <span>🆔</span>
                    <span>{meeting.assigneeStaffId || '未設定'}</span>
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {meeting.minutesUrl ? (
                  <a
                    href={meeting.minutesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 min-h-[36px]"
                  >
                    📄 議事録を開く
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-400 text-xs rounded-lg min-h-[36px]">
                    📄 議事録なし
                  </span>
                )}
                {meeting.meetUrl && (
                  <a
                    href={meeting.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-green-200 text-green-700 text-xs font-medium rounded-lg hover:bg-green-50 min-h-[36px]"
                  >
                    🎥 Meetを開く
                  </a>
                )}
                {meeting.htmlLink && (
                  <a
                    href={meeting.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 min-h-[36px]"
                  >
                    📆 Calendarを開く
                  </a>
                )}
                {(hasMinutes || hasSummary) && (
                  <button
                    onClick={() => toggleExpand(meeting.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 min-h-[36px]"
                  >
                    {isExpanded ? '▲ 折りたたむ' : '▼ 要約を見る'}
                  </button>
                )}
                {/* タスク候補ボタン: アクションアイテムあり の場合のみ表示 */}
                {hasActionItems && (
                  <button
                    onClick={() => toggleTaskPanel(meeting.id)}
                    className={`inline-flex items-center gap-1 px-3 py-2 border text-xs rounded-lg min-h-[36px] ${
                      isTaskRegistered
                        ? 'border-green-200 text-green-600 bg-green-50 hover:bg-green-100'
                        : isTaskPanelOpen
                        ? 'border-blue-400 text-blue-700 bg-blue-50'
                        : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {isTaskRegistered
                      ? '✅ タスク確認'
                      : isTaskPanelOpen
                      ? '▲ タスク候補を閉じる'
                      : `📋 タスク候補 ${(meeting.minutesActionItems || []).length}件`}
                  </button>
                )}
              </div>

              {/* 要約展開パネル */}
              {isExpanded && (
                <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-700 mb-1">📝 要約</p>
                  {meeting.minutesSummary ? (
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {meeting.minutesSummary}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">
                      要約データなし（議事録メール処理前 または 抽出失敗）
                    </p>
                  )}
                </div>
              )}

              {/* タスク候補パネル */}
              {isTaskPanelOpen && !isTaskRegistered && (
                <TaskCandidatePanel
                  meeting={meeting}
                  contactId={contactId}
                  onRegistered={() => {
                    // 登録完了後: タスクパネルを閉じてミーティング一覧を再フェッチ
                    setTaskPanelIds((prev) => {
                      const next = new Set(prev)
                      next.delete(meeting.id)
                      return next
                    })
                    fetchMeetings()
                  }}
                />
              )}

              {/* タスク登録済みの場合の簡易表示 */}
              {isTaskPanelOpen && isTaskRegistered && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700">
                    ✅ タスク登録済み
                    {meeting.minutesTasksRegisteredAt && (
                      <span className="ml-1 text-green-500">
                        ({new Date(meeting.minutesTasksRegisteredAt).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'Asia/Tokyo',
                        })})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Google Tasks で「議事録: ...」タスクを確認してください。
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
