'use client'

import { useRef, useState, useCallback } from 'react'

interface SignatureCanvasProps {
  width: number
  height: number
  onSign: (dataUrl: string) => void
}

export default function SignatureCanvas({ width, height, onSign }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const getPoint = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setDrawing(true)
    lastPoint.current = getPoint(e)
    const canvas = canvasRef.current
    if (canvas) {
      canvas.setPointerCapture(e.pointerId)
    }
  }, [getPoint])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || !lastPoint.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    const point = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPoint.current = point
    setHasSignature(true)
  }, [drawing, getPoint])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setDrawing(false)
    lastPoint.current = null
    const canvas = canvasRef.current
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId)
      if (hasSignature) {
        onSign(canvas.toDataURL('image/png'))
      }
    }
  }, [hasSignature, onSign])

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      setHasSignature(false)
      onSign('')
    }
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width * 2}
        height={height * 2}
        style={{ width, height, touchAction: 'none' }}
        className="border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="absolute top-1 right-1 flex gap-1">
        <button onClick={handleClear}
          className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
          クリア
        </button>
      </div>
      {!hasSignature && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-gray-300 text-sm">ここに署名してください</span>
        </div>
      )}
    </div>
  )
}
