'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TaskList {
  id: string
  title: string
}

interface GoogleTask {
  id: string
  title: string
  notes?: string
  status: string
  due?: string
  completed?: string
  updated?: string
  position?: string
  taskListId?: string
  taskListTitle?: string
}

// ドラッグ可能なタスク行
function SortableTaskRow({
  task,
  isCompleted,
  isExpanded,
  onToggleComplete,
  onDelete,
  onOpenDetail,
  onSaveEdit,
  onCloseDetail,
  editTitle,
  setEditTitle,
  editNotes,
  setEditNotes,
  editDue,
  setEditDue,
  saving,
  formatDue,
}: {
  task: GoogleTask
  isCompleted: boolean
  isExpanded: boolean
  onToggleComplete: () => void
  onDelete: () => void
  onOpenDetail: () => void
  onSaveEdit: () => void
  onCloseDetail: () => void
  editTitle: string
  setEditTitle: (v: string) => void
  editNotes: string
  setEditNotes: (v: string) => void
  editDue: string
  setEditDue: (v: string) => void
  saving: boolean
  formatDue: (due?: string) => { text: string; color: string } | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={`border-b ${isCompleted ? 'border-gray-50' : 'border-gray-100'}`}>
      <div className={`flex items-start gap-1 px-2 py-2 hover:bg-gray-50 group cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}>
        {/* ドラッグハンドル */}
        {!isCompleted && (
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 p-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            title="ドラッグで並べ替え"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </svg>
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onToggleComplete() }}
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
        <div className="flex-1 min-w-0" onClick={onOpenDetail}>
          <p className={`text-sm leading-snug break-words ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.due && !isCompleted && (() => {
              const d = formatDue(task.due)
              return d ? <span className={`text-xs ${d.color}`}>{d.text}</span> : null
            })()}
            {task.notes && !isExpanded && (
              <span className="text-xs text-gray-400 truncate max-w-[120px]">
                {task.notes.split('\n')[0]}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs flex-shrink-0 p-0.5 transition-opacity"
        >
          ✕
        </button>
      </div>

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
              onClick={onSaveEdit}
              disabled={saving || !editTitle.trim()}
              className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={onCloseDetail}
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

export default function TaskPanel() {
  const { data: session } = useSession()
  const [tasks, setTasks] = useState<GoogleTask[]>([])
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDue, setEditDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [panelWidth, setPanelWidth] = useState(256)
  const isResizing = useRef(false)
  const tabsRef = useRef<HTMLDivElement>(null)

  // リサイズハンドル
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = panelWidth

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const delta = startX - e.clientX
      const newWidth = Math.min(600, Math.max(180, startWidth + delta))
      setPanelWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [panelWidth])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

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
      const data = await res.json()
      setTaskLists(data.taskLists || [])
      const fetchedTasks: GoogleTask[] = data.tasks || []
      setTasks(fetchedTasks)
      // 初回: 最初のリストを選択
      if (!activeListId && data.taskLists?.length > 0) {
        setActiveListId(data.taskLists[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken]) // activeListIdを依存から除外（初回のみセット）

  useEffect(() => { fetchTasks() }, [fetchTasks])

  useEffect(() => {
    if (!session?.accessToken) return
    // Tasks API のクォータ（プロジェクト単位50,000リクエスト/日）に配慮して
    // 自動更新は5分間隔。即時反映が必要なら手動の🔄ボタンで更新する。
    const interval = setInterval(fetchTasks, 300000)
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
    setEditDue(task.due ? task.due.slice(0, 10) : '')
  }

  const saveEdit = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          notes: editNotes || '',
          due: editDue || null,
          taskListId: task?.taskListId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '保存に失敗しました')
      }
      setExpandedId(null)
      fetchTasks()
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました')
      fetchTasks()
    } finally {
      setSaving(false)
    }
  }

  const toggleComplete = async (taskId: string, currentStatus: string) => {
    const task = tasks.find(t => t.id === taskId)
    const newStatus = currentStatus === 'completed' ? 'needsAction' : 'completed'
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    if (expandedId === taskId) setExpandedId(null)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, taskListId: task?.taskListId }),
      })
    } catch { fetchTasks() }
  }

  const deleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (expandedId === taskId) setExpandedId(null)
    try {
      await fetch(`/api/tasks/${taskId}?taskListId=${task?.taskListId || ''}`, { method: 'DELETE' })
    } catch { fetchTasks() }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const listTasks = tasks
      .filter(t => t.taskListId === activeListId && t.status === 'needsAction')
      .sort((a, b) => (a.position || '').localeCompare(b.position || ''))

    const oldIndex = listTasks.findIndex(t => t.id === active.id)
    const newIndex = listTasks.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(listTasks, oldIndex, newIndex)

    // UIを即座に更新（positionを仮設定）
    setTasks(prev => {
      const otherTasks = prev.filter(t => !(t.taskListId === activeListId && t.status === 'needsAction'))
      const updated = reordered.map((t, i) => ({ ...t, position: String(i).padStart(20, '0') }))
      return [...otherTasks, ...updated]
    })

    // 移動先の前のタスクIDを取得
    const movedTaskId = active.id as string
    const previousTaskId = newIndex > 0 ? reordered[newIndex - 1].id : null

    try {
      await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: movedTaskId,
          taskListId: activeListId,
          previousTaskId: previousTaskId === movedTaskId ? null : previousTaskId,
        }),
      })
    } catch {
      fetchTasks()
    }
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

  // 現在選択中リストのタスクをフィルタ
  const currentTasks = activeListId
    ? tasks.filter(t => t.taskListId === activeListId)
    : tasks

  const pending = currentTasks
    .filter(t => t.status === 'needsAction')
    .sort((a, b) => (a.position || '').localeCompare(b.position || ''))
  const completed = currentTasks.filter(t => t.status === 'completed')

  // 全体の未完了数（バッジ用）
  const totalPending = tasks.filter(t => t.status === 'needsAction').length

  const panelContent = (
    <div className="overflow-y-scroll h-full" style={{ overscrollBehavior: 'contain' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white">
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">タスク</span>
            {!loading && <span className="text-xs text-gray-400">{totalPending}</span>}
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

        {/* タブバー */}
        {taskLists.length > 1 && (
          <div
            ref={tabsRef}
            className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {taskLists.map(list => {
              const listPending = tasks.filter(t => t.taskListId === list.id && t.status === 'needsAction').length
              const isActive = activeListId === list.id
              return (
                <button
                  key={list.id}
                  onClick={() => { setActiveListId(list.id); setExpandedId(null) }}
                  className={`flex-shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {list.title}
                  {listPending > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                      isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {listPending}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {error && <div className="p-2 bg-red-50 text-red-600 text-xs border-b border-red-100">{error}</div>}
      </div>

      {/* Task List — 全体をスクロール可能にし、ヘッダー/タブはstickyで固定 */}
      <div>
        {loading && tasks.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm animate-pulse">読み込み中...</div>
        ) : currentTasks.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">タスクなし</div>
        ) : (
          <div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pending.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {pending.map(task => (
                  <SortableTaskRow
                    key={task.id}
                    task={task}
                    isCompleted={false}
                    isExpanded={expandedId === task.id}
                    onToggleComplete={() => toggleComplete(task.id, task.status)}
                    onDelete={() => deleteTask(task.id)}
                    onOpenDetail={() => openDetail(task)}
                    onSaveEdit={() => saveEdit(task.id)}
                    onCloseDetail={() => setExpandedId(null)}
                    editTitle={editTitle}
                    setEditTitle={setEditTitle}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    editDue={editDue}
                    setEditDue={setEditDue}
                    saving={saving}
                    formatDue={formatDue}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {completed.length > 0 && (
              <div className="border-t border-gray-200">
                <p className="px-3 py-2 text-xs font-medium text-gray-400 bg-gray-50">完了済み ({completed.length})</p>
                {completed.map(task => (
                  <SortableTaskRow
                    key={task.id}
                    task={task}
                    isCompleted={true}
                    isExpanded={expandedId === task.id}
                    onToggleComplete={() => toggleComplete(task.id, task.status)}
                    onDelete={() => deleteTask(task.id)}
                    onOpenDetail={() => openDetail(task)}
                    onSaveEdit={() => saveEdit(task.id)}
                    onCloseDetail={() => setExpandedId(null)}
                    editTitle={editTitle}
                    setEditTitle={setEditTitle}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    editDue={editDue}
                    setEditDue={setEditDue}
                    saving={saving}
                    formatDue={formatDue}
                  />
                ))}
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
          {totalPending > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{totalPending}</span>
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
          {totalPending > 0 && (
            <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center mt-1">{totalPending}</span>
          )}
        </button>
      )}

      {!collapsed && (
        <div className="hidden md:flex h-screen flex-shrink-0 relative">
          {/* リサイズハンドル（aside外側に配置） */}
          <div
            onMouseDown={startResize}
            className="absolute -left-2 top-0 bottom-0 w-4 cursor-col-resize z-30 group"
            title="ドラッグで幅を変更"
          >
            <div className="absolute left-1.5 top-0 bottom-0 w-1 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors rounded" />
          </div>
          <aside
            className="h-full bg-white border-l border-gray-200 overflow-hidden"
            style={{ width: panelWidth }}
          >
            {panelContent}
          </aside>
        </div>
      )}
    </>
  )
}
