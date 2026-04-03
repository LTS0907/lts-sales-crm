'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Template {
  fileName: string
  displayName: string
  hasFields: boolean
  fieldCount: number
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/contracts/templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/contracts/templates', { method: 'POST', body: fd })
      if (res.ok) fetchTemplates()
      else alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">契約書テンプレート</h1>
          <p className="text-sm text-gray-500 mt-1">PDFテンプレートの管理と入力フィールドの配置設定</p>
        </div>
        <label className={`px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          {uploading ? 'アップロード中...' : 'テンプレートを追加'}
          <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-gray-600">テンプレートがありません</p>
          <p className="text-sm text-gray-400 mt-1">PDFファイルをアップロードしてください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.fileName} className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm">
              <span className="text-2xl">📄</span>
              <div className="flex-1">
                <p className="font-medium text-gray-800">{t.displayName}</p>
                <p className="text-xs text-gray-500">
                  {t.hasFields
                    ? `✅ ${t.fieldCount}個のフィールド設定済み`
                    : '⚠️ フィールド未設定'}
                </p>
              </div>
              <Link
                href={`/contracts/templates/${encodeURIComponent(t.displayName)}`}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t.hasFields ? 'フィールド編集' : 'フィールド設定'}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
