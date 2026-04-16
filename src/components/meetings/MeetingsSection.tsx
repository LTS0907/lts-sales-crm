'use client'

/**
 * MeetingsSection — 顧客詳細ページの「過去の打ち合わせ」セクション
 *
 * - 開催済み / 予定の打ち合わせ一覧
 * - AI要約を展開表示
 * - Meet URL・Googleカレンダーへのリンク
 */

import { useState } from 'react'

interface Meeting {
  id: string
  title?: string | null
  date: string | Date
  duration?: number | null
  location?: string | null
  notes?: string | null
  meetUrl?: string | null
  htmlLink?: string | null
  summary?: string | null
  summaryAt?: string | Date | null
  syncedAt?: string | Date | null
  status?: string | null
  transcriptDriveId?: string | null
}

interface Participant {
  meetingId: string
  Meeting: Meeting
}

export default function MeetingsSection({
  participants = [],
  onSchedule,
}: {
  participants: Participant[]
  onSchedule: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 日付降順ソート
  const sorted = [...participants]
    .map(p => p.Meeting)
    .filter(Boolean)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const now = Date.now()
  const upcoming = sorted.filter(m => new Date(m.date).getTime() >= now)
  const past = sorted.filter(m => new Date(m.date).getTime() < now)

  const renderMeeting = (m: Meeting, isUpcoming: boolean) => {
    const isExpanded = expandedId === m.id
    const hasTranscript = Boolean(m.summary || m.transcriptDriveId)

    return (
      <div
        key={m.id}
        className={`border rounded-lg p-3 ${isUpcoming ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">
                {new Date(m.date).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
              {m.duration && <span className="text-xs text-gray-400">({m.duration}分)</span>}
              {isUpcoming && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">🔵 予定</span>
              )}
              {!isUpcoming && m.status === 'COMPLETED' && (
                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">✅ 完了</span>
              )}
              {hasTranscript && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">📝 議事録あり</span>
              )}
            </div>
            <h4 className="font-semibold text-sm text-gray-900 mt-1">{m.title || '(タイトル未設定)'}</h4>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {m.meetUrl && (
              <a
                href={m.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                title="Meet URL"
              >
                🎥 Meet
              </a>
            )}
            {m.htmlLink && (
              <a
                href={m.htmlLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded"
                title="Googleカレンダー"
              >
                📅
              </a>
            )}
          </div>
        </div>

        {(m.summary || m.notes) && (
          <div className="mt-2">
            <button
              onClick={() => setExpandedId(isExpanded ? null : m.id)}
              className="text-xs text-blue-600 hover:underline"
            >
              {isExpanded ? '▲ 要約を閉じる' : '▼ 要約を見る'}
            </button>
            {isExpanded && (
              <div className="mt-2 p-3 bg-white border border-gray-100 rounded text-sm text-gray-700 whitespace-pre-wrap">
                {m.summary || m.notes}
                {m.summaryAt && (
                  <div className="text-xs text-gray-400 mt-2">
                    🤖 AI要約: {new Date(m.summaryAt).toLocaleString('ja-JP')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          📅 打ち合わせ履歴
          {sorted.length > 0 && (
            <span className="text-xs text-gray-500 font-normal">({sorted.length}件)</span>
          )}
        </h3>
        <button
          onClick={onSchedule}
          className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg"
        >
          + スケジュール
        </button>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-6 text-sm text-gray-400">
          まだ打ち合わせの履歴がありません
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-blue-600 mb-2">予定 ({upcoming.length})</h4>
          <div className="space-y-2">{upcoming.map(m => renderMeeting(m, true))}</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-2">過去 ({past.length})</h4>
          <div className="space-y-2">{past.map(m => renderMeeting(m, false))}</div>
        </div>
      )}
    </div>
  )
}
