'use client'

import { useEffect, useState } from 'react'
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
    const handler = (e: ClipboardEvent) => {
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
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
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
        setPasteError('このブラウザでは貼り付けボタンが使えません。入力欄で Cmd+V（Windows: Ctrl+V）を押してください')
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
      setPasteError('クリップボードに画像が見つかりません。先にスクショを撮ってください（Mac: Ctrl+Shift+Cmd+4 / Win: Win+Shift+S）')
    } catch (e) {
      setPasteError(
        e instanceof Error
          ? `貼り付け失敗: ${e.message}（入力欄で Cmd+V / Ctrl+V を試してください）`
          : '貼り付け失敗'
      )
    }
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
      const data = (await res.json()) as { results?: SendResult[]; error?: string }
      if (!res.ok && res.status !== 207) {
        setError(data.error || `送信失敗 (${res.status})`)
        return
      }
      const failed = (data.results || []).filter(r => !r.success)
      if (failed.length === (data.results || []).length && (data.results || []).length > 0) {
        setError(`送信失敗: ${failed[0]?.error || 'unknown'}`)
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
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      1️⃣ OS のショートカットでスクショを撮る
                      <br />
                      <span className="ml-4">Mac: <code className="bg-gray-100 px-1 rounded">Ctrl+Shift+Cmd+4</code></span>
                      <br />
                      <span className="ml-4">Win: <code className="bg-gray-100 px-1 rounded">Win+Shift+S</code></span>
                      <br />
                      2️⃣ 下のボタンか、メッセージ欄で <code className="bg-gray-100 px-1 rounded">Cmd/Ctrl+V</code> を押して貼り付け
                    </p>
                    <button
                      type="button"
                      onClick={handlePasteClick}
                      disabled={sending}
                      className="w-full py-2 border border-dashed border-gray-300 hover:border-rose-400 hover:bg-rose-50 rounded-lg text-sm text-gray-700 disabled:opacity-50"
                    >
                      📋 クリップボードから貼り付け
                    </button>
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
