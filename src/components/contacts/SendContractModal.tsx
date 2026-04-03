'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ signingUrl: string } | null>(null)

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

  const selectedTemplate = templates.find(t => t.fileName === selected)

  const handleSend = async () => {
    if (!selected || !selectedTemplate?.hasFields) return
    setSending(true)
    try {
      const res = await fetch('/api/contracts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, templateFileName: selected }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ signingUrl: data.signingUrl })
        onSent()
      } else {
        alert(data.error || '送信に失敗しました')
      }
    } catch {
      alert('送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">契約書を送信</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {result ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-lg font-semibold text-gray-800 mb-2">送信完了</p>
              <p className="text-sm text-gray-600 mb-4">
                {contact.email} に署名リンクを送信しました。
              </p>
              <div className="bg-gray-50 p-3 rounded-lg text-xs break-all text-gray-500">
                {result.signingUrl}
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{contact.company || ''} {contact.name}</strong> 様へ送信する契約書テンプレートを選択してください。
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
                        <p className="text-xs text-gray-500">
                          {t.hasFields ? `${t.fieldCount}個のフィールド設定済み` : '⚠️ フィールド未設定'}
                        </p>
                      </div>
                      {!t.hasFields && (
                        <Link
                          href={`/contracts/templates/${encodeURIComponent(t.displayName)}`}
                          className="text-xs text-blue-600 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          設定する
                        </Link>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              キャンセル
            </button>
            <button onClick={handleSend}
              disabled={!selected || !selectedTemplate?.hasFields || sending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
              {sending ? '送信中...' : '送信する'}
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
