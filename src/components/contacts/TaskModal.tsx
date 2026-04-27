'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { PRESET_TASKS } from '@/lib/task-presets'

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  contactId: string
  contactName: string
  onTaskCreated: () => void
}

const TEAM_TASK_USERS: { email: string; name: string }[] = [
  { email: 'ryouchiku@life-time-support.com', name: '龍竹' },
  { email: 'r.kabashima@life-time-support.com', name: '樺嶋' },
]

export default function TaskModal({ isOpen, onClose, contactId, contactName, onTaskCreated }: TaskModalProps) {
  const { data: session } = useSession()
  const myEmail = session?.user?.email
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState<string>(
    myEmail && TEAM_TASK_USERS.some(u => u.email === myEmail) ? myEmail : TEAM_TASK_USERS[0].email
  )

  if (!isOpen) return null

  const selectPreset = (preset: { label: string; icon: string }) => {
    if (selectedPreset === preset.label) {
      // 同じものをタップしたら解除
      setSelectedPreset(null)
      setTitle('')
    } else {
      setSelectedPreset(preset.label)
      setTitle(preset.label)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          title: `${title.trim()} - ${contactName}`,
          notes: notes || undefined,
          due: due || undefined,
          presetLabel: selectedPreset || undefined,
          ownerEmail,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'タスク作成に失敗しました')
      }
      onTaskCreated()
      onClose()
      setTitle('')
      setDue('')
      setNotes('')
      setSelectedPreset(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">タスク追加</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">✕</button>
          </div>
          <p className="text-xs text-gray-500 mt-1">{contactName}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Preset Buttons */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">よくあるタスク</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_TASKS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    selectedPreset === preset.label
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span className="truncate">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Task name input */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">タスク名</label>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setSelectedPreset(null) }}
              placeholder="タスク名を入力..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">担当者</label>
            <select
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TEAM_TASK_USERS.map(u => (
                <option key={u.email} value={u.email}>
                  {u.name}{u.email === myEmail ? '（自分）' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">期限（任意）</label>
            <input
              type="date"
              value={due}
              onChange={e => setDue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="メモを入力..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!title.trim() || loading}
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '作成中...' : 'タスクを作成'}
          </button>
        </form>
      </div>
    </div>
  )
}
