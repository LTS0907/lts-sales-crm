'use client'

/**
 * GoogleTasksWidget — トップページ上部のタスクウィジェット。
 * デフォルトで自分のタスクのみ表示。担当者プルダウンで他メンバー or 全員を切り替え可能。
 * メインタスクとサブタスクは Google Tasks の parent リレーションでグルーピングし、
 * メインのみ表示 → クリックでサブタスク展開。完了は確認モーダルを挟み、
 * メイン完了時はサブタスクもまとめて完了させる。
 */

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'

interface GTask {
  id: string
  title: string
  notes?: string | null
  status: 'needsAction' | 'completed' | string
  due?: string | null
  parent?: string | null
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
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [confirmTask, setConfirmTask] = useState<GTask | null>(null)

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

  const patchStatus = async (task: GTask, status: 'completed' | 'needsAction') => {
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status } : t)))
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          taskListId: task.taskListId,
          ownerEmail: task.ownerEmail,
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
    } catch {
      load()
    }
  }

  // チェックボックス押下 → 完了の場合は確認モーダル / 戻すのは即実行
  const requestToggle = (task: GTask) => {
    if (task.status === 'completed') {
      patchStatus(task, 'needsAction')
    } else {
      setConfirmTask(task)
    }
  }

  // モーダルでの確定: 親完了時はサブタスクもまとめて完了
  const confirmComplete = async () => {
    if (!confirmTask) return
    const target = confirmTask
    setConfirmTask(null)
    const subs = tasks.filter(t => t.parent === target.id && t.status !== 'completed')
    await Promise.all([
      patchStatus(target, 'completed'),
      ...subs.map(c => patchStatus(c, 'completed')),
    ])
  }

  const toggleParent = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 担当者フィルター適用
  const filteredTasks = tasks.filter(t => {
    if (ownerFilter === 'all') return true
    if (ownerFilter === 'me') return t.ownerEmail === myEmail
    return t.ownerEmail === ownerFilter
  })

  // parent → children のマップ（完了済みも含めて保持。展開時に文脈として表示）
  const childrenByParent = useMemo(() => {
    const m = new Map<string, GTask[]>()
    for (const t of filteredTasks) {
      if (t.parent) {
        const arr = m.get(t.parent) || []
        arr.push(t)
        m.set(t.parent, arr)
      }
    }
    return m
  }, [filteredTasks])

  // メインタスクのみ抽出（parentなし & 未完了）
  const activeMainTasks = filteredTasks.filter(t => !t.parent && t.status !== 'completed')
  const crmTasks = activeMainTasks.filter(t => t.taskListTitle === CRM_LIST_NAME)
  const otherTasks = activeMainTasks.filter(t => t.taskListTitle !== CRM_LIST_NAME)

  // ヘッダー件数表示用：メインのみカウント
  const totalActiveMain = activeMainTasks.length

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
            {totalActiveMain === 0 && !loading && <span>完了済み ✨</span>}
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

          {!loading && !error && totalActiveMain === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              🎉 タスクはすべて完了しています
            </div>
          )}

          {sortedCrm.length > 0 && (
            <div className="bg-gradient-to-r from-yellow-50/30 to-transparent">
              <div className="px-5 py-2 text-xs font-bold text-orange-700 bg-yellow-50/50 border-b border-yellow-100">
                ⭐ 優先度の高いタスク (CRM)
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
                {sortedCrm.map(task => (
                  <MainTaskCard
                    key={task.id}
                    task={task}
                    subtasks={childrenByParent.get(task.id) || []}
                    isExpanded={expandedParents.has(task.id)}
                    onToggleExpand={() => toggleParent(task.id)}
                    onRequestToggle={requestToggle}
                    priority
                    showOwner={ownerFilter === 'all'}
                  />
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
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
                  {sortedOther.map(task => (
                    <MainTaskCard
                      key={task.id}
                      task={task}
                      subtasks={childrenByParent.get(task.id) || []}
                      isExpanded={expandedParents.has(task.id)}
                      onToggleExpand={() => toggleParent(task.id)}
                      onRequestToggle={requestToggle}
                      showOwner={ownerFilter === 'all'}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 完了確認モーダル */}
      {confirmTask && (
        <ConfirmCompleteModal
          task={confirmTask}
          subtaskCount={
            (childrenByParent.get(confirmTask.id) || []).filter(c => c.status !== 'completed').length
          }
          onCancel={() => setConfirmTask(null)}
          onConfirm={confirmComplete}
        />
      )}
    </div>
  )
}

function MainTaskCard({
  task,
  subtasks,
  isExpanded,
  onToggleExpand,
  onRequestToggle,
  priority = false,
  showOwner = false,
}: {
  task: GTask
  subtasks: GTask[]
  isExpanded: boolean
  onToggleExpand: () => void
  onRequestToggle: (t: GTask) => void
  priority?: boolean
  showOwner?: boolean
}) {
  const due = dueLabel(task.due)
  const hasChildren = subtasks.length > 0
  const incompleteChildren = subtasks.filter(c => c.status !== 'completed').length
  const totalChildren = subtasks.length
  const borderColor = priority ? 'border-orange-200' : 'border-gray-200'
  const bgColor = priority ? 'bg-white' : 'bg-white'

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      <div className={`flex items-start gap-2 p-2 ${priority ? 'hover:bg-orange-50' : 'hover:bg-gray-50'} transition-colors`}>
        <input
          type="checkbox"
          checked={task.status === 'completed'}
          onChange={() => onRequestToggle(task)}
          onClick={e => e.stopPropagation()}
          className={`mt-0.5 flex-shrink-0 ${priority ? 'accent-orange-500' : ''}`}
        />
        <button
          type="button"
          onClick={hasChildren ? onToggleExpand : undefined}
          className={`flex-1 min-w-0 text-left ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
          title={task.title}
          disabled={!hasChildren}
        >
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
            {hasChildren && (
              <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                📋 {incompleteChildren}/{totalChildren}
              </span>
            )}
            {!priority && !hasChildren && !due.label && !showOwner && (
              <span className="text-[10px] text-gray-400 truncate">{task.taskListTitle}</span>
            )}
          </div>
        </button>
        {hasChildren && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0 mt-0.5 text-xs px-1"
            aria-label={isExpanded ? '閉じる' : '開く'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-2 py-1.5 space-y-0.5">
          {subtasks.map(child => (
            <SubTaskRow
              key={child.id}
              task={child}
              onRequestToggle={onRequestToggle}
              showOwner={showOwner}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubTaskRow({
  task,
  onRequestToggle,
  showOwner,
}: {
  task: GTask
  onRequestToggle: (t: GTask) => void
  showOwner?: boolean
}) {
  const due = dueLabel(task.due)
  const isDone = task.status === 'completed'
  return (
    <div className="flex items-start gap-2 pl-3 py-1 rounded hover:bg-white transition-colors">
      <span className="text-gray-300 text-[10px] mt-1 flex-shrink-0">└</span>
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onRequestToggle(task)}
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className={`text-xs leading-tight line-clamp-2 ${isDone ? 'line-through text-gray-400' : 'text-gray-700'}`}>
          {task.title || '(タイトルなし)'}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {showOwner && task.ownerName && (
            <span className="text-[10px] px-1 py-0 rounded border border-gray-200 bg-gray-50 text-gray-600">
              {task.ownerName}
            </span>
          )}
          {due.label && <span className={`text-[10px] ${due.color}`}>{due.label}</span>}
        </div>
      </div>
    </div>
  )
}

function ConfirmCompleteModal({
  task,
  subtaskCount,
  onCancel,
  onConfirm,
}: {
  task: GTask
  subtaskCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 mb-2">タスクを完了にしますか？</h3>
        <p className="text-sm text-gray-700 mb-1 break-words">
          「{task.title || '(タイトルなし)'}」
        </p>
        {subtaskCount > 0 && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-2 mt-3">
            ⚠️ 未完了のサブタスク {subtaskCount}件もまとめて完了になります
          </p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm rounded bg-orange-500 text-white hover:bg-orange-600 font-medium"
            autoFocus
          >
            完了する
          </button>
        </div>
      </div>
    </div>
  )
}
