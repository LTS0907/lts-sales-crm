'use client'
import { useState } from 'react'
import { PRESET_TASKS } from '@/lib/task-presets'

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  contactId: string
  contactName: string
  onTaskCreated: () => void
}

export default function TaskModal({ isOpen, onClose, contactId, contactName, onTaskCreated }: TaskModalProps) {
  const [customTitle, setCustomTitle] = useState('')
  const [customDue, setCustomDue] = useState('')
  const [customNotes, setCustomNotes] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  if (!isOpen) return null

  const createTask = async (title: string, presetLabel?: string) => {
    setLoading(presetLabel || title)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          title: `${title} - ${contactName}`,
          notes: customNotes || undefined,
          due: customDue || undefined,
          presetLabel,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'タスク作成に失敗しました')
      }
      onTaskCreated()
      onClose()
      setCustomTitle('')
      setCustomDue('')
      setCustomNotes('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customTitle.trim()) return
    createTask(customTitle.trim())
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

        {/* Preset Buttons */}
        <div className="p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-3">ワンタップ作成</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_TASKS.map(preset => (
              <button
                key={preset.label}
                onClick={() => createTask(preset.label, preset.label)}
                disabled={loading !== null}
                className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors disabled:opacity-50"
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
                {loading === preset.label && <span className="ml-auto animate-spin text-xs">⏳</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Task Form */}
        <form onSubmit={handleCustomSubmit} className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500">カスタムタスク</p>
          <input
            type="text"
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
            placeholder="タスク名を入力..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">期限（任意）</label>
              <input
                type="date"
                value={customDue}
                onChange={e => setCustomDue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <textarea
            value={customNotes}
            onChange={e => setCustomNotes(e.target.value)}
            placeholder="メモ（任意）"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            type="submit"
            disabled={!customTitle.trim() || loading !== null}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && loading === customTitle ? '作成中...' : 'タスクを作成'}
          </button>
        </form>
      </div>
    </div>
  )
}
