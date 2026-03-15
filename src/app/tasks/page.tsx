'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import TaskList from '@/components/tasks/TaskList'

export default function TasksPage() {
  const { data: session } = useSession()
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    if (!session?.accessToken) return
    setLoading(true)
    try {
      const res = await fetch('/api/tasks')
      if (res.ok) {
        const data = await res.json()
        setTasks(data)
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const toggleComplete = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'needsAction' : 'completed'
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      fetchTasks() // Revert on error
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  if (!session) {
    return (
      <div className="p-6 text-center text-gray-400">
        ログインしてください
      </div>
    )
  }

  const pending = tasks.filter(t => t.status === 'needsAction')

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">タスク一覧</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Google Tasks「CRM」リストと同期
            {!loading && ` — 未完了 ${pending.length}件`}
          </p>
        </div>
        <button
          onClick={fetchTasks}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '更新中...' : '更新'}
        </button>
      </div>

      <TaskList
        tasks={tasks}
        loading={loading}
        onToggleComplete={toggleComplete}
        onDelete={deleteTask}
        showContact={true}
      />
    </div>
  )
}
