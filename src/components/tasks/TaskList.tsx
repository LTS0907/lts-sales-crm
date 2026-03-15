'use client'
import { useState } from 'react'
import Link from 'next/link'

interface Task {
  id: string
  title: string
  notes?: string
  status: string
  due?: string
  completed?: string
  contactId: string
  contactName: string
  contactCompany?: string
  presetLabel?: string
}

interface TaskListProps {
  tasks: Task[]
  loading: boolean
  onToggleComplete: (taskId: string, currentStatus: string) => void
  onDelete: (taskId: string) => void
  showContact?: boolean
}

export default function TaskList({ tasks, loading, onToggleComplete, onDelete, showContact = false }: TaskListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (taskId: string) => {
    if (!confirm('このタスクを削除しますか？')) return
    setDeletingId(taskId)
    await onDelete(taskId)
    setDeletingId(null)
  }

  const formatDue = (due?: string) => {
    if (!due) return null
    const date = new Date(due)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDate = new Date(date)
    dueDate.setHours(0, 0, 0, 0)
    const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    let color = 'text-gray-500'
    let label = date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })

    if (diff < 0) {
      color = 'text-red-600 font-medium'
      label = `${Math.abs(diff)}日超過`
    } else if (diff === 0) {
      color = 'text-orange-600 font-medium'
      label = '今日'
    } else if (diff === 1) {
      color = 'text-orange-500'
      label = '明日'
    }

    return <span className={`text-xs ${color}`}>{label}</span>
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-pulse">タスクを読み込み中...</div>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        タスクはありません
      </div>
    )
  }

  const pending = tasks.filter(t => t.status === 'needsAction')
  const completed = tasks.filter(t => t.status === 'completed')

  return (
    <div className="space-y-4">
      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-1">
          {pending.map(task => (
            <div
              key={task.id}
              className={`flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors ${
                deletingId === task.id ? 'opacity-50' : ''
              }`}
            >
              <button
                onClick={() => onToggleComplete(task.id, task.status)}
                className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-blue-500 flex-shrink-0 transition-colors"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{task.title}</p>
                {showContact && (
                  <Link href={`/contacts/${task.contactId}`} className="text-xs text-blue-600 hover:underline">
                    {task.contactName}{task.contactCompany ? ` (${task.contactCompany})` : ''}
                  </Link>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {formatDue(task.due)}
                  {task.presetLabel && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                      {task.presetLabel}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(task.id)}
                className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0 p-1"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">完了済み ({completed.length})</p>
          <div className="space-y-1">
            {completed.map(task => (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl ${
                  deletingId === task.id ? 'opacity-50' : ''
                }`}
              >
                <button
                  onClick={() => onToggleComplete(task.id, task.status)}
                  className="mt-0.5 w-5 h-5 rounded-full bg-green-500 border-2 border-green-500 flex-shrink-0 flex items-center justify-center"
                >
                  <span className="text-white text-xs">✓</span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-400 line-through">{task.title}</p>
                  {showContact && (
                    <Link href={`/contacts/${task.contactId}`} className="text-xs text-gray-400 hover:underline">
                      {task.contactName}
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0 p-1"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
