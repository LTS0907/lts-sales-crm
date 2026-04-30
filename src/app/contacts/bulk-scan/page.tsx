'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ---------- 型 ---------- */
interface CardData {
  id: string
  name: string
  nameKana: string
  company: string
  department: string
  title: string
  email: string
  phone: string
  website: string
  address: string
}

interface ScanResult {
  id: string
  file: File              // 表面
  previewUrl: string
  backFile?: File         // 裏面（任意）
  backPreviewUrl?: string
  status: 'pending' | 'scanning' | 'done' | 'error'
  error?: string
  data: CardData
  selected: boolean
}

const EMPTY_DATA = (): Omit<CardData, 'id'> => ({
  name: '', nameKana: '', company: '', department: '',
  title: '', email: '', phone: '', website: '', address: '',
})

/* ---------- インライン編集セル ---------- */
function EditableCell({
  value, onChange, className = '',
}: { value: string; onChange: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = () => { onChange(draft); setEditing(false) }

  if (editing) {
    return (
      <input
        autoFocus
        className={`w-full px-1 py-0.5 border border-blue-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      />
    )
  }
  return (
    <span
      className={`block cursor-pointer rounded px-1 py-0.5 text-sm hover:bg-blue-50 min-w-[60px] ${value ? '' : 'text-gray-400'} ${className}`}
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      {value || '—'}
    </span>
  )
}

/* ---------- メインページ ---------- */
export default function BulkScanPage() {
  const router = useRouter()
  const dropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [results, setResults] = useState<ScanResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  /* ---- ファイル追加 ---- */
  const addFiles = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    const newResults: ScanResult[] = imageFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      data: { id: crypto.randomUUID(), ...EMPTY_DATA() },
      selected: true,
    }))
    setResults(prev => [...prev, ...newResults])
  }

  /* ---- ドラッグ & ドロップ ---- */
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  /* ---- OCR実行 ---- */
  const startScan = async () => {
    const targets = results.filter(r => r.status === 'pending')
    if (targets.length === 0) return
    setScanning(true)
    setProgress({ done: 0, total: targets.length })

    // 並列 (最大5並列) で処理
    const CONCURRENCY = 5
    let done = 0

    const process = async (r: ScanResult) => {
      setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'scanning' } : x))
      try {
        const fd = new FormData()
        // 多画像対応: 'images' で複数枚まとめて送信
        fd.append('images', r.file)
        if (r.backFile) fd.append('images', r.backFile)
        const res = await fetch('/api/ai/scan-card', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '解析失敗')
        setResults(prev => prev.map(x => x.id === r.id ? {
          ...x, status: 'done',
          data: { ...x.data, ...Object.fromEntries(Object.entries(json).filter(([, v]) => typeof v === 'string' && v !== '')) },
        } : x))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown'
        setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'error', error: msg } : x))
      }
      done++
      setProgress(p => ({ ...p, done }))
    }

    // チャンクに分けて並列実行
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      await Promise.all(targets.slice(i, i + CONCURRENCY).map(process))
    }
    setScanning(false)
  }

  /* ---- セル更新 ---- */
  const updateField = (id: string, field: keyof CardData, value: string) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, data: { ...r.data, [field]: value } } : r))
  }

  /* ---- 選択 ---- */
  const toggleSelect = (id: string) => setResults(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r))
  const allSelected = results.length > 0 && results.every(r => r.selected)
  const toggleAll = () => { const sel = !allSelected; setResults(prev => prev.map(r => ({ ...r, selected: sel }))) }

  /* ---- 行削除 ---- */
  const removeRow = (id: string) => {
    setResults(prev => {
      const r = prev.find(x => x.id === id)
      if (r) {
        URL.revokeObjectURL(r.previewUrl)
        if (r.backPreviewUrl) URL.revokeObjectURL(r.backPreviewUrl)
      }
      return prev.filter(x => x.id !== id)
    })
  }

  /* ---- 裏面の追加・削除 ---- */
  const addBackImage = (id: string, file: File) => {
    if (!file.type.startsWith('image/')) return
    setResults(prev => prev.map(r => {
      if (r.id !== id) return r
      if (r.backPreviewUrl) URL.revokeObjectURL(r.backPreviewUrl)
      return {
        ...r,
        backFile: file,
        backPreviewUrl: URL.createObjectURL(file),
        // 裏面を追加したら再スキャンが必要
        status: r.status === 'done' ? 'pending' : r.status,
      }
    }))
  }

  const removeBackImage = (id: string) => {
    setResults(prev => prev.map(r => {
      if (r.id !== id) return r
      if (r.backPreviewUrl) URL.revokeObjectURL(r.backPreviewUrl)
      return { ...r, backFile: undefined, backPreviewUrl: undefined }
    }))
  }

  /* ---- 一括保存（multipart で画像も同送） ---- */
  const handleSave = async () => {
    const targets = results.filter(r => r.selected && r.data.name.trim() !== '')
    if (targets.length === 0) return
    setSaving(true)
    try {
      const fd = new FormData()
      const contactsPayload = targets.map(r => ({ ...r.data, id: r.id }))
      fd.append('contacts', JSON.stringify(contactsPayload))
      for (const r of targets) {
        if (r.file) fd.append(`frontImage_${r.id}`, r.file)
        if (r.backFile) fd.append(`backImage_${r.id}`, r.backFile)
      }
      const res = await fetch('/api/contacts/bulk', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '保存失敗')
      setSavedCount(json.count)
      setSaved(true)
    } catch (err: unknown) {
      alert('保存中にエラーが発生しました: ' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = results.filter(r => r.selected).length
  const validSelectedCount = results.filter(r => r.selected && r.data.name.trim() !== '').length
  const doneCount = results.filter(r => r.status === 'done').length
  const pendingCount = results.filter(r => r.status === 'pending').length

  /* ---- 完了画面 ---- */
  if (saved) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <div className="bg-white rounded-xl border border-gray-200 p-10">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{savedCount}件の名刺を登録しました！</h2>
          <p className="text-gray-500 text-sm mb-8">名刺情報がCRMに保存されました。</p>
          <div className="flex gap-3 justify-center">
            <Link href="/contacts" className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              名刺一覧を見る
            </Link>
            <button onClick={() => { setResults([]); setSaved(false); setSavedCount(0) }}
              className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
              続けて登録する
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">一括名刺スキャン</h1>
          <p className="text-sm text-gray-500 mt-0.5">複数の名刺画像をまとめてAI読み取りし、一括登録できます</p>
        </div>
        <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700">← 名刺一覧に戻る</Link>
      </div>

      {/* ファイルアップロードエリア */}
      {results.length === 0 || pendingCount > 0 ? (
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <div className="text-4xl mb-3">📷</div>
          <p className="text-gray-700 font-medium">ここに名刺画像をドラッグ&ドロップ</p>
          <p className="text-gray-400 text-sm mt-1">または クリックしてファイルを選択</p>
          <p className="text-gray-400 text-xs mt-2">複数選択可・JPEG/PNG対応（20〜30枚想定）</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }}
          />
        </div>
      ) : null}

      {/* 追加ボタン（結果がある場合） */}
      {results.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            + 画像を追加
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }}
          />
          {pendingCount > 0 && (
            <button
              onClick={startScan}
              disabled={scanning}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? '読み取り中...' : `読み取り開始（${pendingCount}枚）`}
            </button>
          )}
          <span className="text-sm text-gray-400 ml-auto">{results.length}枚</span>
        </div>
      )}

      {/* 進捗バー */}
      {scanning && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between text-sm text-gray-700 mb-2">
            <span>AI読み取り中...</span>
            <span>{progress.done} / {progress.total} 枚完了</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* 確認テーブル */}
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-4 h-4 accent-blue-600" />
                  </th>
                  <th className="w-14 px-2 py-3 text-center text-xs font-semibold text-gray-500">画像</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">氏名 *</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">フリガナ</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">会社</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">部署</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">役職</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">電話</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500">メール</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map(r => {
                  const isNameEmpty = r.data.name.trim() === ''
                  return (
                    <tr key={r.id}
                      className={`${r.selected ? '' : 'opacity-40'} ${isNameEmpty && r.status === 'done' ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                    >
                      {/* チェックボックス */}
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={r.selected} onChange={() => toggleSelect(r.id)}
                          className="w-4 h-4 accent-blue-600" />
                      </td>

                      {/* サムネイル + ステータス + 裏面 */}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-start gap-1">
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.previewUrl} alt="表面" className="w-12 h-9 object-cover rounded border border-gray-200" title="表面" />
                            {r.status === 'scanning' && (
                              <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded">
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            {r.status === 'error' && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">!</span>
                              </div>
                            )}
                          </div>
                          {r.backPreviewUrl ? (
                            <div className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r.backPreviewUrl} alt="裏面" className="w-12 h-9 object-cover rounded border border-gray-200" title="裏面" />
                              <button
                                onClick={() => removeBackImage(r.id)}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] leading-none"
                                title="裏面を外す"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <label className="w-12 h-9 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-400 hover:border-blue-400 hover:text-blue-600 cursor-pointer leading-tight" title="裏面を追加">
                              + 裏面
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) addBackImage(r.id, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          )}
                        </div>
                        {r.status === 'error' && <p className="text-xs text-red-500 mt-0.5 max-w-[110px] break-words">失敗</p>}
                        {r.status === 'pending' && <p className="text-xs text-gray-400 mt-0.5">{r.backFile ? '両面待機中' : '待機中'}</p>}
                      </td>

                      {/* 氏名 */}
                      <td className="px-2 py-2 min-w-[100px]">
                        {isNameEmpty && r.status === 'done' ? (
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500 text-xs">⚠</span>
                            <EditableCell value={r.data.name} onChange={v => updateField(r.id, 'name', v)} />
                          </div>
                        ) : (
                          <EditableCell value={r.data.name} onChange={v => updateField(r.id, 'name', v)} />
                        )}
                      </td>

                      {/* その他フィールド */}
                      <td className="px-2 py-2 min-w-[100px]">
                        <EditableCell value={r.data.nameKana} onChange={v => updateField(r.id, 'nameKana', v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <EditableCell value={r.data.company} onChange={v => updateField(r.id, 'company', v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[100px]">
                        <EditableCell value={r.data.department} onChange={v => updateField(r.id, 'department', v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[100px]">
                        <EditableCell value={r.data.title} onChange={v => updateField(r.id, 'title', v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <EditableCell value={r.data.phone} onChange={v => updateField(r.id, 'phone', v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <EditableCell value={r.data.email} onChange={v => updateField(r.id, 'email', v)} />
                      </td>

                      {/* 削除 */}
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeRow(r.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none">
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* フッター: 保存ボタン */}
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              {selectedCount}件選択中
              {validSelectedCount < selectedCount && (
                <span className="text-yellow-600 ml-2">（氏名が空の{selectedCount - validSelectedCount}件は保存対象外）</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || validSelectedCount === 0 || scanning}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '保存中...' : `${validSelectedCount}件を一括登録`}
            </button>
          </div>
        </div>
      )}

      {/* 空状態（スキャン完了後に全件エラー等） */}
      {results.length > 0 && doneCount === 0 && !scanning && results.every(r => r.status === 'error') && (
        <div className="text-center py-8 text-gray-400 text-sm">
          すべての読み取りに失敗しました。画像を確認して再試行してください。
        </div>
      )}
    </div>
  )
}
