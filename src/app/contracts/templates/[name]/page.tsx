'use client'

import { use } from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import FieldEditor from '@/components/contracts/FieldEditor'
import type { ContractField, FieldsConfig } from '@/types/contract'

export default function TemplateFieldEditorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  const templateName = decodeURIComponent(name)
  const [initialFields, setInitialFields] = useState<ContractField[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/contracts/templates/${encodeURIComponent(templateName)}/fields`)
        const data = await res.json()
        setInitialFields(data.config?.fields || [])
      } catch {
        setInitialFields([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [templateName])

  const handleSave = async (fields: ContractField[]) => {
    const config: FieldsConfig = { templateName, fields }
    const res = await fetch(`/api/contracts/templates/${encodeURIComponent(templateName)}/fields`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) throw new Error('Save failed')
  }

  // The PDF URL provides base64 data via the template API
  const pdfUrl = `/api/contracts/templates/${encodeURIComponent(templateName)}/fields`

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/contracts/templates" className="text-gray-400 hover:text-gray-600 text-lg">← </Link>
        <h1 className="text-xl font-bold text-gray-800">{templateName}</h1>
        <span className="text-sm text-gray-500">フィールド配置エディタ</span>
      </div>

      {loading || initialFields === null ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : (
        <FieldEditor
          templateName={templateName}
          pdfUrl={pdfUrl}
          initialFields={initialFields}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
