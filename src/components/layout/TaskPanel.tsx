'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface GoogleTask {
  id: string
  title: string
  notes?: string
  status: string
  due?: string
  completed?: string
  updated?: string
}

export default function TaskPanel() {
  const { data: session } = useSession()
  const [tasks, setTasks] = useState<GoogleTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 編集中の値
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDue, setEditDue] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTasks = useCallback(async () => {
    if (!session?.accessToken) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'タスク取得に失敗')
      }
      setTasks(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  useEffect(() => {
    if (!session?.accessToken) return
    const interval = setInterval(fetchTasks, 60000)
    return () => clearInterval(interval)
  }, [session?.accessToken, fetchTasks])

  const openDetail = (task: GoogleTask) => {
    if (expandedId === task.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(task.id)
    setEditTitle(task.title || '')
    setEditNotes(task.notes || '')
    // Google Tasks の due は "2026-03-15T00:00:00.000Z" 形式
    setEditDue(task.due ? task.due.slice(0, 10) : '')
  }

  const saveEdit = async (taskId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          notes: editNotes || '',
          due: editDue || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '保存に失敗しました')
      }
      // APIレスポンス（Google Tasksの実際の値）でローカルを更新
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        title: updated.title,
        notes: updated.notes,
        due: updated.due,
        status: updated.status,
        completed: updated.completed,
        updated: updated.updated,
      } : t))
      setExpandedId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const toggleComplete = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'needsAction' : 'completed'
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    if (expandedId === taskId) setExpandedId(null)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch { fetchTasks() }
  }

  const deleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (expandedId === taskId) setExpandedId(null)
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    } catch { fetchTasks() }
  }

  const formatDue = (due?: string) => {
    if (!due) return null
    const d = new Date(due)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const dueDate = new Date(d); dueDate.setHours(0, 0, 0, 0)
    const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { text: `${Math.abs(diff)}日超過`, color: 'text-red-600' }
    if (diff === 0) return { text: '今日', color: 'text-orange-600' }
    if (diff === 1) return { text: '明日', color: 'text-orange-500' }
    return { text: d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }), color: 'text-gray-500' }
  }

  if (!session) return null

  const pending = tasks.filter(t => t.status === 'needsAction')
  const completed = tasks.filter(t => t.status === 'completed')

  const renderTaskRow = (task: GoogleTask, isCompleted: boolean) => {
    const isExpanded = expandedId === task.id
    return (
      <div key={task.id} className={`border-b ${isCompleted ? 'border-gray-50' : 'border-gray-100'}`}>
        {/* メイン行 */}
        <div className={`flex items-start gap-2 px-3 py-2 hover:bg-gray-50 group cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}>
          <button
            onClick={e => { e.stopPropagation(); toggleComplete(task.id, task.status) }}
            className={`mt-0.5 w-[18px] h-[18px] rounded-full flex-shrink-0 transition-colors flex items-center justify-center ${
              isCompleted
                ? 'bg-blue-500 border-2 border-blue-500'
                : 'border-2 border-gray-300 hover:border-blue-500'
            }`}
          >
            {isCompleted && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <div className="flex-1 min-w-0" onClick={() => openDetail(task)}>
            <p className={`text-sm leading-snug break-words ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {task.due && !isCompleted && (() => {
                const d = formatDue(task.due)
                return d ? <span className={`text-xs ${d.color}`}>{d.text}</span> : null
              })()}
              {task.notes && !isExpanded && (
                <span className="text-xs text-gray-400 truncate max-w-[120px]">📝 {task.notes.split('\n')[0]}</span>
              )}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs flex-shrink-0 p-0.5 transition-opacity"
          >
            ✕
          </button>
        </div>

        {/* 展開エリア */}
        {isExpanded && (
          <div className="px-3 pb-3 bg-blue-50 border-t border-blue-100 space-y-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1 mt-2">タスク名</label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">期限</label>
              <input
                type="date"
                value={editDue}
                onChange={e => setEditDue(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">メモ</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => saveEdit(task.id)}
                disabled={saving || !editTitle.trim()}
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => setExpandedId(null)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-white"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">CRM タスク</span>
          {!loading && <span className="text-xs text-gray-400">{pending.length}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchTasks} disabled={loading} className="p-1 text-gray-400 hover:text-gray-600 rounded disabled:opacity-50" title="更新">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={() => setCollapsed(true)} className="hidden md:block p-1 text-gray-400 hover:text-gray-600 rounded" title="閉じる">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600 rounded">✕</button>
        </div>
      </div>

      {error && <div className="p-2 bg-red-50 text-red-600 text-xs border-b border-red-100">{error}</div>}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {loading && tasks.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm animate-pulse">読み込み中...</div>
        ) : tasks.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">タスクなし</div>
        ) : (
          <div>
            {pending.map(task => renderTaskRow(task, false))}
            {completed.length > 0 && (
              <div className="border-t border-gray-200">
                <p className="px-3 py-2 text-xs font-medium text-gray-400 bg-gray-50">完了済み ({completed.length})</p>
                {completed.map(task => renderTaskRow(task, true))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed bottom-4 right-4 z-40 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700"
        >
          <span className="text-lg">✓</span>
          {pending.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{pending.length}</span>
          )}
        </button>
      )}

      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setMobileOpen(false)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl" style={{ maxHeight: '70vh' }}>
            {panelContent}
          </div>
        </>
      )}

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-white border border-r-0 border-gray-200 rounded-l-lg px-1.5 py-3 shadow-sm flex-col items-center gap-1 hover:bg-gray-50"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />
          </svg>
          <span className="text-xs text-gray-600 font-medium" style={{ writingMode: 'vertical-rl' }}>タスク</span>
          {pending.length > 0 && (
            <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center mt-1">{pending.length}</span>
          )}
        </button>
      )}

      {!collapsed && (
        <aside className="hidden md:flex w-64 bg-white border-l border-gray-200 flex-col flex-shrink-0">
          {panelContent}
        </aside>
      )}
    </>
  )
}
