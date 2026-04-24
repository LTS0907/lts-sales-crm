'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

type SendResult = { recipient: string; success: boolean; error?: string }

export default function SupportButton() {
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!screenshot) {
      setScreenshotPreview(null)
      return
    }
    const url = URL.createObjectURL(screenshot)
    setScreenshotPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])

  // モーダル内で Ctrl/Cmd+V を受けてスクショを取り込む
  useEffect(() => {
    if (!open) return
    const pasteHandler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setScreenshot(file)
            setPasteError(null)
            e.preventDefault()
            return
          }
        }
      }
    }
    // モーダル外への誤ドロップでブラウザが画像を開いてしまうのを防ぐ
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('paste', pasteHandler)
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('paste', pasteHandler)
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [open])

  if (status !== 'authenticated' || !session?.user?.email) return null

  const resetForm = () => {
    setMessage('')
    setScreenshot(null)
    setError(null)
    setDone(false)
    setPasteError(null)
  }

  const handleOpen = () => {
    resetForm()
    setOpen(true)
  }

  const handleClose = () => {
    if (sending) return
    setOpen(false)
    resetForm()
  }

  const handlePasteClick = async () => {
    setPasteError(null)
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setPasteError('このブラウザでは貼り付けボタンが使えないの…下の「📁 ファイルを選ぶ」ボタンか、メッセージ欄で Cmd+V を試してね')
        return
      }
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const ext = imageType.split('/')[1] || 'png'
          const file = new File([blob], `screenshot.${ext}`, { type: imageType })
          setScreenshot(file)
          return
        }
      }
      setPasteError('クリップボードに画像がないみたい。先にスクショを撮ってね（Mac: Ctrl+Shift+Cmd+4 / Win: Win+Shift+S）。撮れない時は下のファイル選択でもOK！')
    } catch (e) {
      setPasteError(
        e instanceof Error
          ? `貼り付けできなかった: ${e.message}。下の「📁 ファイルを選ぶ」ボタンで代わりに添付してね`
          : '貼り付けできなかった。ファイル選択を使ってね'
      )
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPasteError('画像ファイルを選んでね')
      return
    }
    setScreenshot(file)
    setPasteError(null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer?.files || [])
    const image = files.find(f => f.type.startsWith('image/'))
    if (!image) {
      setPasteError('画像ファイルをドロップしてね（png / jpg / gif 等）')
      return
    }
    setScreenshot(image)
    setPasteError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('メッセージを入力してください')
      return
    }
    setSending(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('message', message.trim())
      fd.append('pageUrl', typeof window !== 'undefined' ? window.location.href : '')
      if (screenshot) fd.append('screenshot', screenshot)

      const res = await fetch('/api/support/send', { method: 'POST', body: fd })
      const data = (await res.json()) as {
        results?: SendResult[]
        error?: string
        summary?: { anyFailed: boolean; allFailed: boolean; recipientCount: number }
      }
      const results = data.results || []
      const failed = results.filter(r => !r.success)
      if (failed.length === results.length && results.length > 0) {
        const firstErr = failed[0]?.error || data.error || `HTTP ${res.status}`
        setError(`送信できなかった: ${firstErr}`)
        return
      }
      if (!res.ok && res.status !== 207) {
        setError(data.error || `送信失敗 (${res.status})`)
        return
      }
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '通信エラー')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="サポートに連絡"
        className="fixed bottom-20 right-4 md:bottom-5 md:right-5 z-40 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-lg px-4 py-3 text-sm font-medium flex items-center gap-1.5 print:hidden"
      >
        <span aria-hidden>🆘</span>
        <span className="hidden sm:inline">サポート</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4"
          onClick={handleClose}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              <div className="p-6 text-center">
                <div className="text-5xl mb-3">✅</div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">送信しました</h2>
                <p className="text-sm text-gray-500 mb-5">
                  龍竹さんと樺嶋さんに Google Chat で通知されました。
                  <br />
                  お急ぎの場合はチャットでも続きの連絡ができます。
                </p>
                <button
                  onClick={handleClose}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm"
                >
                  閉じる
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">🆘 サポートに連絡</h2>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={sending}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs text-rose-900 leading-relaxed">
                  操作でお困りのこと・不具合を送るフォームです。
                  <br />
                  龍竹さん・樺嶋さんの Google Chat に直接届きます。
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    困っていること・不具合 *
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={5}
                    required
                    placeholder="例: 顧客ページで保存ボタンを押すとエラーが出ます"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    スクリーンショット（任意）
                  </label>
                  <div
                    className={`space-y-2 rounded-lg p-3 border-2 border-dashed transition-colors ${
                      isDragOver
                        ? 'border-rose-500 bg-rose-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <p className="text-xs text-gray-600 leading-relaxed text-center">
                      {isDragOver ? (
                        <span className="font-semibold text-rose-700">ここで離してね！</span>
                      ) : (
                        <>
                          📎 <strong>ここに画像をドラッグ＆ドロップ</strong>
                          <br />
                          または下のボタンから画像を追加してね
                        </>
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handlePasteClick}
                        disabled={sending}
                        className="py-2 border border-gray-300 bg-white hover:border-rose-400 hover:bg-rose-50 rounded-lg text-sm text-gray-700 disabled:opacity-50"
                      >
                        📋 貼り付け
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending}
                        className="py-2 border border-gray-300 bg-white hover:border-rose-400 hover:bg-rose-50 rounded-lg text-sm text-gray-700 disabled:opacity-50"
                      >
                        📁 ファイルを選ぶ
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-700">💡 スクショの撮り方（Mac/Win）</summary>
                      <div className="mt-1 pl-4 leading-relaxed">
                        <p>Mac: <code className="bg-white px-1 rounded border">Ctrl+Shift+Cmd+4</code>（クリップボード直行）</p>
                        <p>Win: <code className="bg-white px-1 rounded border">Win+Shift+S</code></p>
                        <p className="mt-1">撮ったら「📋 貼り付け」か、メッセージ欄で <code className="bg-white px-1 rounded border">Cmd/Ctrl+V</code></p>
                      </div>
                    </details>
                    {pasteError && (
                      <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg p-2">
                        {pasteError}
                      </div>
                    )}
                    {screenshotPreview && (
                      <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshotPreview}
                          alt="スクリーンショットプレビュー"
                          className="w-full max-h-48 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setScreenshot(null)}
                          className="absolute top-1 right-1 bg-white/90 hover:bg-white text-gray-700 rounded-full w-7 h-7 text-xs shadow"
                          aria-label="スクリーンショットを削除"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    ❌ {error}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={sending || !message.trim()}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm"
                  >
                    {sending ? '送信中...' : '🆘 送信'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={sending}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
