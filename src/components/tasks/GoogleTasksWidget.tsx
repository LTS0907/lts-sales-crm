'use client'

/**
 * GoogleTasksWidget — トップページ上部のタスクウィジェット。
 * デフォルトで自分のタスクのみ表示。担当者プルダウンで他メンバー or 全員を切り替え可能。
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface GTask {
  id: string
  title: string
  notes?: string | null
  status: 'needsAction' | 'completed' | string
  due?: string | null
  taskListId: string
  taskListTitle: string
  ownerEmail?: string
  ownerName?: string
}

const CRM_LIST_NAME = 'CRM'

function dueLabel(due?: string | null): { label: string; color: string } {
  if (!due) return { label: '', color: 'text-gray-400' }
  const d = new Date(due)
  const now = new Date()
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`

  if (diffDays < 0) return { label: `🔴 ${dateStr} (期限切れ)`, color: 'text-red-600 font-semibold' }
  if (diffDays === 0) return { label: `⏰ ${dateStr} (今日)`, color: 'text-orange-600 font-semibold' }
  if (diffDays === 1) return { label: `${dateStr} (明日)`, color: 'text-orange-500' }
  if (diffDays <= 7) return { label: dateStr, color: 'text-blue-600' }
  return { label: dateStr, color: 'text-gray-500' }
}

export default function GoogleTasksWidget() {
  const { data: session } = useSession()
  const myEmail = session?.user?.email
  const [tasks, setTasks] = useState<GTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [otherExpanded, setOtherExpanded] = useState(false)
  // 'me' | 'all' | 'ryouchiku@...' | 'r.kabashima@...'
  const [ownerFilter, setOwnerFilter] = useState<string>('me')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'タスクの取得に失敗しました')
        return
      }
      setTasks(data.tasks || [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '通信エラー')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleComplete = async (task: GTask) => {
    const newStatus = task.status === 'completed' ? 'needsAction' : 'completed'
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: newStatus } : t)))
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          taskListId: task.taskListId,
          ownerEmail: task.ownerEmail,
        }),
      })
    } catch {
      load()
    }
  }

  // 担当者フィルター適用
  const filteredTasks = tasks.filter(t => {
    if (ownerFilter === 'all') return true
    if (ownerFilter === 'me') return t.ownerEmail === myEmail
    return t.ownerEmail === ownerFilter
  })

  const activeTasks = filteredTasks.filter(t => t.status !== 'completed')
  const crmTasks = activeTasks.filter(t => t.taskListTitle === CRM_LIST_NAME)
  const otherTasks = activeTasks.filter(t => t.taskListTitle !== CRM_LIST_NAME)

  const sortByDue = (arr: GTask[]) =>
    [...arr].sort((a, b) => {
      if (!a.due && !b.due) return 0
      if (!a.due) return 1
      if (!b.due) return -1
      return new Date(a.due).getTime() - new Date(b.due).getTime()
    })

  const sortedCrm = sortByDue(crmTasks)
  const sortedOther = sortByDue(otherTasks)

  // 担当者プルダウン用の選択肢
  const ownerOptions: { value: string; label: string }[] = [
    { value: 'me', label: '自分' },
    { value: 'all', label: '全員' },
    ...Array.from(
      new Map(
        tasks
          .filter(t => t.ownerEmail && t.ownerName && t.ownerEmail !== myEmail)
          .map(t => [t.ownerEmail!, { value: t.ownerEmail!, label: t.ownerName! }])
      ).values()
    ),
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6 shadow-sm">
      {/* ヘッダー */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-yellow-50 to-orange-50 border-b border-orange-100 hover:brightness-95"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">📌</span>
          <h2 className="font-bold text-gray-900">今日のタスク</h2>
          <span className="text-xs text-gray-500">
            {crmTasks.length > 0 && (
              <span className="text-orange-700 font-semibold">⭐ CRM: {crmTasks.length}件</span>
            )}
            {crmTasks.length > 0 && otherTasks.length > 0 && <span> / </span>}
            {otherTasks.length > 0 && <span>その他: {otherTasks.length}件</span>}
            {activeTasks.length === 0 && !loading && <span>完了済み ✨</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ownerFilter}
            onChange={e => { e.stopPropagation(); setOwnerFilter(e.target.value) }}
            onClick={e => e.stopPropagation()}
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {ownerOptions.map(o => (
              <option key={o.value} value={o.value}>👤 {o.label}</option>
            ))}
          </select>
          <button
            onClick={(e) => { e.stopPropagation(); load() }}
            className="text-xs text-gray-500 hover:text-gray-700"
            title="再読込"
          >
            🔄
          </button>
          <span className="text-gray-400 text-sm">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100">
          {loading && (
            <div className="p-5 text-center text-sm text-gray-400">読み込み中...</div>
          )}

          {error && (
            <div className="p-5 text-center text-sm text-red-600 bg-red-50">
              ❌ {error}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/auth/signin' }}
                  className="text-blue-600 underline text-xs"
                >
                  再ログイン
                </button>
              </div>
            </div>
          )}

          {!loading && !error && activeTasks.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              🎉 タスクはすべて完了しています
            </div>
          )}

          {sortedCrm.length > 0 && (
            <div className="bg-gradient-to-r from-yellow-50/30 to-transparent">
              <div className="px-5 py-2 text-xs font-bold text-orange-700 bg-yellow-50/50 border-b border-yellow-100">
                ⭐ 優先度の高いタスク (CRM)
              </div>
              <div className="p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                {sortedCrm.map(task => (
                  <TaskCard key={task.id} task={task} onToggle={toggleComplete} priority showOwner={ownerFilter === 'all'} />
                ))}
              </div>
            </div>
          )}

          {sortedOther.length > 0 && (
            <>
              <button
                onClick={() => setOtherExpanded(!otherExpanded)}
                className="w-full px-5 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border-b border-gray-100 flex items-center justify-between transition-colors"
              >
                <span>📋 その他のタスク ({sortedOther.length}件)</span>
                <span className="text-gray-400">{otherExpanded ? '▼' : '▶'}</span>
              </button>
              {otherExpanded && (
                <div className="p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {sortedOther.map(task => (
                    <TaskCard key={task.id} task={task} onToggle={toggleComplete} showOwner={ownerFilter === 'all'} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task,
  onToggle,
  priority = false,
  showOwner = false,
}: {
  task: GTask
  onToggle: (t: GTask) => void
  priority?: boolean
  showOwner?: boolean
}) {
  const due = dueLabel(task.due)
  const borderColor = priority ? 'border-orange-200' : 'border-gray-200'
  const bgColor = priority ? 'bg-white hover:bg-orange-50' : 'bg-white hover:bg-gray-50'
  return (
    <div
      className={`flex items-start gap-2 p-2 rounded-lg border ${borderColor} ${bgColor} transition-colors`}
      title={task.title}
    >
      <input
        type="checkbox"
        checked={task.status === 'completed'}
        onChange={() => onToggle(task)}
        className={`mt-0.5 flex-shrink-0 ${priority ? 'accent-orange-500' : ''}`}
      />
      <div className="flex-1 min-w-0">
        <div className={`text-xs leading-tight ${priority ? 'font-semibold text-gray-900' : 'text-gray-700'} line-clamp-2`}>
          {task.title || '(タイトルなし)'}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {showOwner && task.ownerName && (
            <span className="text-[10px] px-1 py-0 rounded border border-gray-200 bg-gray-50 text-gray-600">
              {task.ownerName}
            </span>
          )}
          {due.label && <span className={`text-[10px] ${due.color}`}>{due.label}</span>}
          {!priority && !due.label && !showOwner && (
            <span className="text-[10px] text-gray-400 truncate">{task.taskListTitle}</span>
          )}
        </div>
      </div>
    </div>
  )
}
