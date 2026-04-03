'use client'

import { use, useState, useEffect, useRef, useCallback } from 'react'
import SignatureCanvas from '@/components/contracts/SignatureCanvas'
import type { ContractField, SigningData } from '@/types/contract'

export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<SigningData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [currentPage, setCurrentPage] = useState(0)
  const [pageImages, setPageImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch signing data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/contracts/${token}/signing-data`)
        if (res.status === 410) {
          const d = await res.json()
          setAlreadySigned(d.signedAt)
          return
        }
        if (!res.ok) {
          setError('契約書が見つかりませんでした。')
          return
        }
        const d: SigningData = await res.json()
        setData(d)

        // Initialize prefill values
        const initial: Record<string, string> = {}
        for (const field of d.fields) {
          if (d.prefillValues[field.id]) {
            initial[field.id] = d.prefillValues[field.id]
          }
        }
        setFieldValues(initial)

        // Render PDF pages
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const pdfData = Uint8Array.from(atob(d.pdfBase64), c => c.charCodeAt(0))
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
        setPageImages(images)
      } catch {
        setError('読み込みに失敗しました。')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const updateField = useCallback((id: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [id]: value }))
  }, [])

  const handleSubmit = async () => {
    if (!data) return

    // Validate required fields
    const missing = data.fields.filter(f => f.required && f.signer === 'CLIENT' && !fieldValues[f.id])
    if (missing.length > 0) {
      alert(`入力が必要な項目があります: ${missing.map(f => f.label).join(', ')}`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/contracts/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldValues }),
      })
      if (res.ok) {
        setCompleted(true)
      } else {
        const d = await res.json()
        alert(d.error || '送信に失敗しました')
      }
    } catch {
      alert('送信に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  // Completed view
  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">署名が完了しました</h1>
          <p className="text-sm text-gray-600">ありがとうございました。契約書の署名が正常に完了しました。</p>
          <p className="text-xs text-gray-400 mt-4">このページを閉じていただいて構いません。</p>
        </div>
      </div>
    )
  }

  // Already signed
  if (alreadySigned) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-5xl mb-4">📝</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">署名済みです</h1>
          <p className="text-sm text-gray-600">
            この契約書は既に署名されています。
            <br />署名日: {new Date(alreadySigned).toLocaleString('ja-JP')}
          </p>
        </div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">エラー</h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // Loading
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">契約書を読み込んでいます...</p>
      </div>
    )
  }

  const pageFields = data.fields.filter(f => f.page === currentPage && f.signer === 'CLIENT')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">電子契約書</h1>
            <p className="text-xs text-gray-500">{data.templateName}</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>{data.contactCompany || ''} {data.contactName} 様</p>
            <p>株式会社ライフタイムサポート</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto p-4">
        {/* Page navigation */}
        {pageImages.length > 1 && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-30">
              ◀ 前のページ
            </button>
            <span className="text-sm text-gray-600">{currentPage + 1} / {pageImages.length}</span>
            <button onClick={() => setCurrentPage(p => Math.min(pageImages.length - 1, p + 1))}
              disabled={currentPage >= pageImages.length - 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-30">
              次のページ ▶
            </button>
          </div>
        )}

        {/* PDF with fields */}
        <div ref={containerRef} className="relative inline-block mx-auto w-full">
          {pageImages[currentPage] && (
            <img src={pageImages[currentPage]} alt={`Page ${currentPage + 1}`}
              className="w-full shadow-lg rounded-lg" draggable={false} />
          )}

          {/* Field overlays */}
          {pageFields.map(field => (
            <div key={field.id}
              className="absolute"
              style={{
                left: `${field.x}%`, top: `${field.y}%`,
                width: `${field.width}%`, height: `${field.height}%`,
              }}
            >
              {field.type === 'SIGNATURE' ? (
                <SignatureCanvas
                  width={300}
                  height={100}
                  onSign={dataUrl => updateField(field.id, dataUrl)}
                />
              ) : field.type === 'SIGNER_TEXT' ? (
                <input
                  type="text"
                  value={fieldValues[field.id] || ''}
                  onChange={e => updateField(field.id, e.target.value)}
                  placeholder={field.label}
                  className="w-full h-full px-2 text-sm border border-blue-300 rounded bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : field.type === 'DATE' ? (
                <input
                  type="date"
                  value={fieldValues[field.id] || ''}
                  onChange={e => updateField(field.id, e.target.value)}
                  className="w-full h-full px-2 text-sm border border-green-300 rounded bg-white/90 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              ) : field.type === 'CHECKBOX' ? (
                <label className="flex items-center justify-center w-full h-full cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fieldValues[field.id] === 'true'}
                    onChange={e => updateField(field.id, e.target.checked ? 'true' : '')}
                    className="w-5 h-5 accent-blue-600"
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>

        {/* Submit area */}
        <div className="mt-6 bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
          <p className="text-sm text-gray-600 mb-4">
            全ページの内容を確認し、必要な箇所に入力・署名してください。
          </p>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? '送信中...' : '署名して送信する'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4 mb-8">
          Powered by 株式会社ライフタイムサポート
        </p>
      </div>
    </div>
  )
}
