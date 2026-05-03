'use client'
import { useState, useEffect } from 'react'

interface Participant {
  contactId: string
  Contact: { id: string; name: string }
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
  assigneeStaffId: string | null
  status: string
  owner: string
  MeetingParticipant: Participant[]
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

export default function ContactMinutesSection({ contactId }: { contactId: string }) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  useEffect(() => {
    const fetchMeetings = async () => {
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
    fetchMeetings()
  }, [contactId])

  const totalCount = meetings.length
  const minutesCount = meetings.filter(m => m.minutesUrl).length

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
        {meetings.map(meeting => {
          const hasMinutes = !!meeting.minutesUrl
          const hasSummary = !!meeting.minutesSummary
          const isCancelled = meeting.status === 'CANCELLED'
          const isOnline = !!meeting.meetUrl
          const participants = meeting.MeetingParticipant.map(p => p.Contact.name)
          const ownerLabel = OWNER_LABEL[meeting.owner] || meeting.owner
          const isExpanded = expandedIds.has(meeting.id)

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
            </div>
          )
        })}
      </div>
    </div>
  )
}
