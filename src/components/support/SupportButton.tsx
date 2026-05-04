'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'

type SendState = 'idle' | 'sending' | 'success' | 'error'

type Shot = { id: string; blob: Blob; url: string; label: string }

function makeShot(blob: Blob, label: string): Shot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    blob,
    url: URL.createObjectURL(blob),
    label,
  }
}

export default function SupportButton() {
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [shots, setShots] = useState<Shot[]>([])
  const [sendState, setSendState] = useState<SendState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [autoCapturing, setAutoCapturing] = useState(false)
  const [fabHidden, setFabHidden] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // モーダルを閉じる時にプレビューURLを破棄
  useEffect(() => {
    return () => {
      shots.forEach(s => URL.revokeObjectURL(s.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  if (status !== 'authenticated') return null

  const reset = () => {
    setText('')
    shots.forEach(s => URL.revokeObjectURL(s.url))
    setShots([])
    setSendState('idle')
    setErrorMsg(null)
  }

  const close = () => {
    if (sendState === 'sending') return
    setOpen(false)
    setTimeout(reset, 300)
  }

  const addShot = (blob: Blob, label: string) => {
    setShots(prev => [...prev, makeShot(blob, label)])
  }

  const removeShot = (id: string) => {
    setShots(prev => {
      const target = prev.find(s => s.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter(s => s.id !== id)
    })
  }

  /** サポート押下時に画面を自動キャプチャしてからモーダルを開く */
  async function openWithAutoCapture() {
    setErrorMsg(null)
    setAutoCapturing(true)
    setFabHidden(true)
    try {
      await new Promise<void>(r =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      )
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(document.documentElement, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        logging: false,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
      })
      const blob: Blob | null = await new Promise(r =>
        canvas.toBlob(b => r(b), 'image/png')
      )
      if (blob) addShot(blob, '自動スクショ')
    } catch (e) {
      console.warn('[support] auto capture failed:', e)
      setErrorMsg('自動スクショに失敗したよ。下のボタンで写真を追加してね')
    } finally {
      setFabHidden(false)
      setAutoCapturing(false)
      setOpen(true)
    }
  }

  /** 画面キャプチャAPI（別ウィンドウ撮影用） */
  async function captureScreenshot() {
    setErrorMsg(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setErrorMsg('このブラウザは画面キャプチャに対応していないの。下の「📁 ファイルを選ぶ」を使ってね')
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
      addShot(blob, '別ウィンドウ')
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
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) addShot(file, '貼り付け')
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    files.forEach(f => addShot(f, f.name || 'ドロップ'))
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    files.forEach(f => addShot(f, f.name || 'ファイル'))
    // 同じファイルを再選択できるよう input をクリア
    if (e.target) e.target.value = ''
  }

  async function send() {
    if (!text.trim() || sendState === 'sending') return
    setSendState('sending')
    setErrorMsg(null)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('pageUrl', typeof window !== 'undefined' ? window.location.href : '')
      shots.forEach((s, idx) => {
        const ext = s.blob.type.split('/')[1] || 'png'
        const filename = s.blob instanceof File && s.blob.name
          ? s.blob.name
          : `screenshot-${idx + 1}.${ext}`
        fd.append('screenshots', s.blob, filename)
      })
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
      {/* FAB（撮影中は写り込み防止のため非表示） */}
      {!fabHidden && (
        <button
          type="button"
          onClick={openWithAutoCapture}
          disabled={autoCapturing}
          aria-label="サポートに連絡"
          className="fixed bottom-20 right-4 lg:bottom-5 lg:right-5 z-40 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-rose-700 active:scale-95 transition disabled:opacity-70 print:hidden"
        >
          <span aria-hidden>{autoCapturing ? '⏳' : '🆘'}</span>
          <span className="hidden sm:inline">{autoCapturing ? '撮影中...' : 'サポート'}</span>
        </button>
      )}

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
              <h2 className="font-bold text-gray-900">🆘 サポートに連絡（龍竹・樺嶋）</h2>
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
                不具合・質問・要望をどうぞ。Google Chat「LTS開発サポート」に届きます。
                <br />
                📸 押した瞬間の画面はスクショ済み！別ページの問題なら下から写真を追加できるよ
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendState === 'sending'}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  📁 写真を追加
                </button>
                <button
                  type="button"
                  onClick={captureScreenshot}
                  disabled={capturing || sendState === 'sending'}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  📷 {capturing ? '選択待ち...' : '別ウィンドウを撮る'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFileChange}
                  className="hidden"
                />
                <span className="text-xs text-gray-400">
                  ※ 貼り付け（Cmd/Ctrl+V）・ドラッグ&ドロップでも追加可
                </span>
              </div>

              {/* 添付プレビュー（複数枚） */}
              {shots.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">
                    📎 添付 {shots.length}枚
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {shots.map((s, idx) => (
                      <div
                        key={s.id}
                        className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50 group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.url}
                          alt={s.label}
                          className="w-full h-24 object-cover"
                        />
                        <div className="absolute top-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                          {idx + 1}. {s.label}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeShot(s.id)}
                          disabled={sendState === 'sending'}
                          className="absolute top-1 right-1 bg-white/90 hover:bg-white text-red-600 rounded-full w-6 h-6 text-xs leading-none shadow disabled:opacity-50"
                          title="この写真を削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
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
                {sendState === 'sending' ? '送信中...' : `送信${shots.length > 0 ? `（写真${shots.length}枚）` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
