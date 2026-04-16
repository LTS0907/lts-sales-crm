'use client'

/**
 * GoogleTasksWidget — トップページ上部に表示するタスクウィジェット
 *
 * 優先度設計:
 *   1. CRMリストのタスク (⭐代わりの優先マーク、上部に太字表示)
 *   2. その他のリストのタスク (下部にグレー表示)
 *
 * 「CRM」というタスクリストがなければ、存在する全リストを同等に扱う。
 * 完了チェックボックスで即マークし、削除・詳細編集は Google Tasks 側に誘導。
 */

import { useEffect, useState } from 'react'

interface GTask {
  id: string
  title: string
  notes?: string | null
  status: 'needsAction' | 'completed' | string
  due?: string | null
  taskListId: string
  taskListTitle: string
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
  const [tasks, setTasks] = useState<GTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

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
    // Optimistic UI
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, status: newStatus } : t))
    )
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, taskListId: task.taskListId }),
      })
    } catch {
      // ロールバック
      load()
    }
  }

  // 未完了タスクのみ、CRM優先 → その他 の順
  const activeTasks = tasks.filter(t => t.status !== 'completed')
  const crmTasks = activeTasks.filter(t => t.taskListTitle === CRM_LIST_NAME)
  const otherTasks = activeTasks.filter(t => t.taskListTitle !== CRM_LIST_NAME)

  // 期日昇順ソート（期日なしは最後）
  const sortByDue = (arr: GTask[]) =>
    [...arr].sort((a, b) => {
      if (!a.due && !b.due) return 0
      if (!a.due) return 1
      if (!b.due) return -1
      return new Date(a.due).getTime() - new Date(b.due).getTime()
    })

  const sortedCrm = sortByDue(crmTasks)
  const sortedOther = sortByDue(otherTasks)

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
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              load()
            }}
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
                <a
                  href="/api/auth/signin"
                  className="text-blue-600 underline text-xs"
                >
                  再ログイン
                </a>
              </div>
            </div>
          )}

          {!loading && !error && activeTasks.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              🎉 タスクはすべて完了しています
            </div>
          )}

          {/* CRM優先タスク */}
          {sortedCrm.length > 0 && (
            <div className="bg-gradient-to-r from-yellow-50/30 to-transparent">
              <div className="px-5 py-2 text-xs font-bold text-orange-700 bg-yellow-50/50 border-b border-yellow-100">
                ⭐ 優先度の高いタスク (CRM)
              </div>
              {sortedCrm.map(task => (
                <TaskRow key={task.id} task={task} onToggle={toggleComplete} priority />
              ))}
            </div>
          )}

          {/* その他のタスク */}
          {sortedOther.length > 0 && (
            <>
              {sortedCrm.length > 0 && (
                <div className="px-5 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                  📋 その他のタスク
                </div>
              )}
              {sortedOther.map(task => (
                <TaskRow key={task.id} task={task} onToggle={toggleComplete} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  priority = false,
}: {
  task: GTask
  onToggle: (t: GTask) => void
  priority?: boolean
}) {
  const due = dueLabel(task.due)
  return (
    <div className="px-5 py-2.5 flex items-start gap-3 hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        checked={task.status === 'completed'}
        onChange={() => onToggle(task)}
        className={`mt-1 flex-shrink-0 ${priority ? 'accent-orange-500' : ''}`}
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${priority ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate`}>
          {task.title || '(タイトルなし)'}
        </div>
        {task.notes && (
          <div className="text-xs text-gray-500 mt-0.5 truncate">{task.notes}</div>
        )}
        <div className="flex items-center gap-2 mt-1">
          {due.label && <span className={`text-xs ${due.color}`}>{due.label}</span>}
          {priority && (
            <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">
              ⭐ CRM
            </span>
          )}
          {!priority && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              📋 {task.taskListTitle}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
