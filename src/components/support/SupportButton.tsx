'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'

type SendState = 'idle' | 'sending' | 'success' | 'error'

export default function SupportButton() {
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [screenshot, setScreenshot] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sendState, setSendState] = useState<SendState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!screenshot) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(screenshot)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  if (status !== 'authenticated') return null

  const reset = () => {
    setText('')
    setScreenshot(null)
    setSendState('idle')
    setErrorMsg(null)
  }

  const close = () => {
    if (sendState === 'sending') return
    setOpen(false)
    setTimeout(reset, 300)
  }

  async function captureScreenshot() {
    setErrorMsg(null)
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setErrorMsg(
        'このブラウザは画面キャプチャに対応していないの。お手数だけど、別途スクショを撮ってドラッグ&ドロップしてね。'
      )
      return
    }
    setCapturing(true)
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        audio: false,
      })
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      await new Promise<void>(r =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      )
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas context unavailable')
      ctx.drawImage(video, 0, 0)
      const blob: Blob | null = await new Promise(r =>
        canvas.toBlob(b => r(b), 'image/png')
      )
      if (!blob) throw new Error('画像生成に失敗しました')
      setScreenshot(blob)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/permission|denied|cancel|abort/i.test(msg)) {
        setErrorMsg(`スクショ取得に失敗: ${msg}`)
      }
    } finally {
      stream?.getTracks().forEach(t => t.stop())
      setCapturing(false)
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          setScreenshot(file)
          break
        }
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = Array.from(e.dataTransfer.files).find(f =>
      f.type.startsWith('image/')
    )
    if (file) setScreenshot(file)
  }

  async function send() {
    if (!text.trim() || sendState === 'sending') return
    setSendState('sending')
    setErrorMsg(null)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('pageUrl', typeof window !== 'undefined' ? window.location.href : '')
      if (screenshot) {
        fd.append('screenshot', screenshot, 'screenshot.png')
      }
      const res = await fetch('/api/support/send', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const msg = [data.error, data.details].filter(Boolean).join('\n')
        throw new Error(msg || `HTTP ${res.status}`)
      }
      setSendState('success')
      setTimeout(() => {
        setOpen(false)
        setTimeout(reset, 300)
      }, 1500)
    } catch (e) {
      setSendState('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="サポートに連絡"
        className="fixed bottom-20 right-4 md:bottom-5 md:right-5 z-40 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-rose-700 active:scale-95 transition print:hidden"
      >
        <span aria-hidden>🆘</span>
        <span className="hidden sm:inline">サポート</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="font-bold text-gray-900">
                🆘 サポートに連絡（龍竹・樺嶋）
              </h2>
              <button
                type="button"
                onClick={close}
                disabled={sendState === 'sending'}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-xs text-gray-500">
                不具合・質問・要望をどうぞ。Google Chat で龍竹・樺嶋に直接届きます。
              </p>

              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="例: 顧客ページで保存ボタンを押してもエラーになります"
                rows={5}
                disabled={sendState === 'sending'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={captureScreenshot}
                  disabled={capturing || sendState === 'sending'}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  📷 {capturing ? '選択待ち...' : screenshot ? '撮り直す' : 'スクショを撮る'}
                </button>
                {screenshot && (
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    disabled={sendState === 'sending'}
                    className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                  >
                    削除
                  </button>
                )}
                <span className="text-xs text-gray-400">
                  ※ 貼り付け（Cmd/Ctrl+V）・ドラッグ&ドロップでも添付可
                </span>
              </div>

              {previewUrl && (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="スクリーンショットプレビュー"
                    className="max-h-60 w-full object-contain"
                  />
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
                  {errorMsg}
                </div>
              )}

              {sendState === 'success' && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                  ✅ 送信しました。ありがとうございます！
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={sendState === 'sending'}
                className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || sendState === 'sending' || sendState === 'success'}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-rose-300"
              >
                {sendState === 'sending' ? '送信中...' : '送信'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
