'use client'

import { useState, useEffect } from 'react'

interface Template {
  fileName: string
  displayName: string
  hasFields: boolean
  fieldCount: number
}

interface SendContractModalProps {
  isOpen: boolean
  onClose: () => void
  contact: {
    id: string
    name: string
    company: string | null
    email: string | null
  }
  onSent: () => void
}

export default function SendContractModal({ isOpen, onClose, contact, onSent }: SendContractModalProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ driveFileId: string } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setResult(null)
    setSelected('')
    fetch('/api/contracts/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .finally(() => setLoading(false))
  }, [isOpen])

  const handleCreate = async () => {
    if (!selected) return
    setCreating(true)
    try {
      const res = await fetch('/api/contracts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, templateFileName: selected }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ driveFileId: data.driveFileId })
        onSent()
      } else {
        alert(data.error || '作成に失敗しました')
      }
    } catch {
      alert('作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">契約書を作成</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {result ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-lg font-semibold text-gray-800 mb-2">作成完了</p>
              <p className="text-sm text-gray-600 mb-4">
                Google Driveに契約書を作成しました。
              </p>
              <a
                href={`https://drive.google.com/file/d/${result.driveFileId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Driveで開く ↗
              </a>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{contact.company || ''} {contact.name}</strong> 様の契約書テンプレートを選択してください。
                Google Driveフォルダに契約書PDFが作成されます。
              </p>

              {loading ? (
                <p className="text-sm text-gray-500">読み込み中...</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-500">テンプレートがありません。</p>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <label key={t.fileName}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                        ${selected === t.fileName ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input
                        type="radio"
                        name="template"
                        value={t.fileName}
                        checked={selected === t.fileName}
                        onChange={() => setSelected(t.fileName)}
                        className="accent-blue-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{t.displayName}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              キャンセル
            </button>
            <button onClick={handleCreate}
              disabled={!selected || creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
              {creating ? '作成中...' : '作成する'}
            </button>
          </div>
        )}
        {result && (
          <div className="p-4 border-t border-gray-200 flex justify-end">
            <button onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
