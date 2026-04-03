'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ContractField, FieldType } from '@/types/contract'

interface FieldEditorProps {
  templateName: string
  pdfUrl: string // API URL to get PDF as base64
  initialFields: ContractField[]
  onSave: (fields: ContractField[]) => Promise<void>
}

const FIELD_TYPES: { type: FieldType; label: string; icon: string; defaultW: number; defaultH: number }[] = [
  { type: 'SIGNATURE', label: '署名', icon: '✍️', defaultW: 20, defaultH: 6 },
  { type: 'SIGNER_TEXT', label: 'テキスト', icon: '📝', defaultW: 20, defaultH: 3 },
  { type: 'DATE', label: '日付', icon: '📅', defaultW: 15, defaultH: 3 },
  { type: 'CHECKBOX', label: 'チェック', icon: '☑️', defaultW: 3, defaultH: 3 },
]

const PREFILL_OPTIONS = [
  { value: '', label: 'なし' },
  { value: '{{company}}', label: '会社名' },
  { value: '{{name}}', label: '氏名' },
  { value: '{{email}}', label: 'メール' },
  { value: '{{date}}', label: '日付' },
]

const FIELD_COLORS: Record<FieldType, string> = {
  SIGNATURE: 'border-purple-400 bg-purple-50/80',
  SIGNER_TEXT: 'border-blue-400 bg-blue-50/80',
  DATE: 'border-green-400 bg-green-50/80',
  CHECKBOX: 'border-orange-400 bg-orange-50/80',
}

export default function FieldEditor({ templateName, pdfUrl, initialFields, onSave }: FieldEditorProps) {
  const [fields, setFields] = useState<ContractField[]>(initialFields)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pageImages, setPageImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null)

  // Load PDF and render pages as images
  useEffect(() => {
    let cancelled = false
    async function loadPdf() {
      setLoading(true)
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const res = await fetch(pdfUrl)
        const data = await res.json()
        const pdfData = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise

        const images: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas } as any).promise
          images.push(canvas.toDataURL('image/png'))
        }
        if (!cancelled) setPageImages(images)
      } catch (err) {
        console.error('PDF load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPdf()
    return () => { cancelled = true }
  }, [pdfUrl])

  const addField = (type: FieldType) => {
    const ft = FIELD_TYPES.find(f => f.type === type)!
    const id = `f${Date.now()}`
    const newField: ContractField = {
      id, type, label: ft.label, page: currentPage,
      x: 10, y: 10, width: ft.defaultW, height: ft.defaultH,
      required: true, signer: 'CLIENT',
    }
    setFields(prev => [...prev, newField])
    setSelectedId(id)
  }

  const updateField = (id: string, updates: Partial<ContractField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(fields)
      alert('保存しました')
    } catch {
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // Drag handling
  const handleFieldMouseDown = useCallback((e: React.MouseEvent, fieldId: string) => {
    if ((e.target as HTMLElement).dataset.resize) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(fieldId)
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const field = fields.find(f => f.id === fieldId)!
    const fieldPxX = (field.x / 100) * rect.width
    const fieldPxY = (field.y / 100) * rect.height
    setDragging({ id: fieldId, offsetX: e.clientX - rect.left - fieldPxX, offsetY: e.clientY - rect.top - fieldPxY })
  }, [fields])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, fieldId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const field = fields.find(f => f.id === fieldId)!
    setResizing({ id: fieldId, startX: e.clientX, startY: e.clientY, startW: field.width, startH: field.height })
  }, [fields])

  useEffect(() => {
    if (!dragging && !resizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()

      if (dragging) {
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left - dragging.offsetX) / rect.width) * 100))
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top - dragging.offsetY) / rect.height) * 100))
        updateField(dragging.id, { x, y })
      }
      if (resizing) {
        const dxPct = ((e.clientX - resizing.startX) / rect.width) * 100
        const dyPct = ((e.clientY - resizing.startY) / rect.height) * 100
        updateField(resizing.id, {
          width: Math.max(3, resizing.startW + dxPct),
          height: Math.max(2, resizing.startH + dyPct),
        })
      }
    }

    const handleMouseUp = () => {
      setDragging(null)
      setResizing(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, resizing])

  const selectedField = fields.find(f => f.id === selectedId)
  const pageFields = fields.filter(f => f.page === currentPage)

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)]">
      {/* Left: Field Palette */}
      <div className="w-48 flex-shrink-0 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">フィールド追加</h3>
        {FIELD_TYPES.map(ft => (
          <button key={ft.type} onClick={() => addField(ft.type)}
            className="w-full flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">
            <span>{ft.icon}</span>
            <span>{ft.label}</span>
          </button>
        ))}
        <hr className="border-gray-200" />
        <button onClick={handleSave} disabled={saving}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>

      {/* Center: PDF + Fields */}
      <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">PDF読み込み中...</p>
          </div>
        ) : pageImages.length === 0 ? (
          <p className="text-gray-500">PDFを読み込めませんでした</p>
        ) : (
          <>
            {/* Page nav */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-30">
                ◀ 前
              </button>
              <span className="text-sm text-gray-600">{currentPage + 1} / {pageImages.length}</span>
              <button onClick={() => setCurrentPage(p => Math.min(pageImages.length - 1, p + 1))}
                disabled={currentPage >= pageImages.length - 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-30">
                次 ▶
              </button>
            </div>

            {/* PDF with overlay fields */}
            <div ref={containerRef} className="relative inline-block mx-auto" onClick={() => setSelectedId(null)}>
              <img src={pageImages[currentPage]} alt={`Page ${currentPage + 1}`}
                className="block shadow-lg rounded" draggable={false} />

              {pageFields.map(field => (
                <div
                  key={field.id}
                  className={`absolute border-2 rounded cursor-move select-none ${FIELD_COLORS[field.type]}
                    ${selectedId === field.id ? 'ring-2 ring-blue-500' : ''}`}
                  style={{
                    left: `${field.x}%`, top: `${field.y}%`,
                    width: `${field.width}%`, height: `${field.height}%`,
                  }}
                  onMouseDown={e => handleFieldMouseDown(e, field.id)}
                >
                  <span className="absolute top-0 left-1 text-[10px] font-medium text-gray-600 truncate max-w-full">
                    {field.label}
                  </span>
                  {/* Resize handle */}
                  <div
                    data-resize="true"
                    className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-tl cursor-se-resize"
                    onMouseDown={e => handleResizeMouseDown(e, field.id)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right: Field Properties */}
      <div className="w-56 flex-shrink-0 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">プロパティ</h3>
        {selectedField ? (
          <>
            <div>
              <label className="text-xs text-gray-500">ラベル</label>
              <input value={selectedField.label}
                onChange={e => updateField(selectedField.id, { label: e.target.value })}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">タイプ</label>
              <p className="text-sm text-gray-800">{FIELD_TYPES.find(f => f.type === selectedField.type)?.icon} {selectedField.type}</p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500">X (%)</label>
                <input type="number" value={Math.round(selectedField.x * 10) / 10}
                  onChange={e => updateField(selectedField.id, { x: Number(e.target.value) })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">Y (%)</label>
                <input type="number" value={Math.round(selectedField.y * 10) / 10}
                  onChange={e => updateField(selectedField.id, { y: Number(e.target.value) })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500">幅 (%)</label>
                <input type="number" value={Math.round(selectedField.width * 10) / 10}
                  onChange={e => updateField(selectedField.id, { width: Number(e.target.value) })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">高さ (%)</label>
                <input type="number" value={Math.round(selectedField.height * 10) / 10}
                  onChange={e => updateField(selectedField.id, { height: Number(e.target.value) })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
              </div>
            </div>
            {(selectedField.type === 'SIGNER_TEXT' || selectedField.type === 'DATE') && (
              <div>
                <label className="text-xs text-gray-500">自動入力</label>
                <select value={selectedField.prefill || ''}
                  onChange={e => updateField(selectedField.id, { prefill: e.target.value || undefined })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                  {PREFILL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">署名者</label>
              <select value={selectedField.signer || 'CLIENT'}
                onChange={e => updateField(selectedField.id, { signer: e.target.value as 'CLIENT' | 'OWNER' })}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                <option value="CLIENT">クライアント（甲）</option>
                <option value="OWNER">自社（乙）</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selectedField.required !== false}
                onChange={e => updateField(selectedField.id, { required: e.target.checked })}
                className="accent-blue-600" />
              <span className="text-sm text-gray-700">必須</span>
            </div>
            <button onClick={() => removeField(selectedField.id)}
              className="w-full px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              削除
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400">フィールドを選択してください</p>
        )}
      </div>
    </div>
  )
}
