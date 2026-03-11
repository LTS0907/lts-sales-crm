'use client'
import { useState } from 'react'
import { getPhasesForService } from '@/lib/service-phases'

const SERVICE_COLORS: Record<string, { active: string; ring: string; bg: string; text: string; light: string }> = {
  '生成AI活用セミナー':     { active: 'bg-blue-600',   ring: 'ring-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700',   light: 'bg-blue-100'   },
  'AIパーソナルトレーニング':{ active: 'bg-purple-600', ring: 'ring-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', light: 'bg-purple-100' },
  'IT内製化支援':           { active: 'bg-green-600',  ring: 'ring-green-400',  bg: 'bg-green-50',  text: 'text-green-700',  light: 'bg-green-100'  },
  'マーケティング支援':     { active: 'bg-orange-500', ring: 'ring-orange-400', bg: 'bg-orange-50', text: 'text-orange-700', light: 'bg-orange-100' },
  'デバイス販売':           { active: 'bg-gray-600',   ring: 'ring-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-700',   light: 'bg-gray-100'   },
  'その他':                 { active: 'bg-pink-500',   ring: 'ring-pink-400',   bg: 'bg-pink-50',   text: 'text-pink-700',   light: 'bg-pink-100'   },
}

interface Props {
  contactId: string
  service: string
  currentPhase: string | null
  onPhaseChange: (service: string, phase: string) => void
}

export default function ServiceProgressStepper({ contactId, service, currentPhase, onPhaseChange }: Props) {
  const phases = getPhasesForService(service)
  const colors = SERVICE_COLORS[service] || SERVICE_COLORS['その他']
  const currentIdx = currentPhase ? phases.findIndex(p => p.key === currentPhase) : -1
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<number | null>(null)

  const setPhase = async (phaseKey: string, idx: number) => {
    // 現在と同じならリセット（未設定に戻す）
    const nextPhase = currentPhase === phaseKey ? 'NONE' : phaseKey
    setSaving(true)
    try {
      await fetch('/api/service-phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, service, phase: nextPhase }),
      })
      onPhaseChange(service, nextPhase)
    } finally {
      setSaving(false)
    }
  }

  const progressPct = currentIdx >= 0 ? ((currentIdx) / (phases.length - 1)) * 100 : 0

  return (
    <div className={`rounded-xl border p-4 ${colors.bg} border-opacity-50`} style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.light} ${colors.text}`}>{service}</span>
          {currentIdx >= 0 && (
            <span className="text-xs text-gray-500">
              ステップ {currentIdx + 1} / {phases.length}
            </span>
          )}
        </div>
        {currentIdx < 0 ? (
          <span className="text-xs text-gray-400">未開始</span>
        ) : currentIdx === phases.length - 1 ? (
          <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✅ 完了</span>
        ) : (
          <span className={`text-xs font-medium ${colors.text}`}>{phases[currentIdx].label}</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative mb-5">
        <div className="h-1.5 bg-white rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.active}`}
            style={{ width: `${currentIdx >= 0 ? progressPct : 0}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="relative">
        {/* Connection line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-white opacity-60" style={{ zIndex: 0 }} />

        <div className="flex justify-between relative" style={{ zIndex: 1 }}>
          {phases.map((phase, idx) => {
            const done = idx < currentIdx
            const current = idx === currentIdx
            const future = idx > currentIdx

            return (
              <div
                key={phase.key}
                className="flex flex-col items-center gap-1.5 cursor-pointer group"
                style={{ flex: 1 }}
                onClick={() => !saving && setPhase(phase.key, idx)}
                onMouseEnter={() => setTooltip(idx)}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Circle */}
                <div className={`
                  relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${done ? `${colors.active} text-white shadow-sm` : ''}
                  ${current ? `${colors.active} text-white shadow-md ring-4 ${colors.ring} ring-opacity-40 scale-110` : ''}
                  ${future ? 'bg-white text-gray-300 border-2 border-gray-200 group-hover:border-gray-400 group-hover:text-gray-500' : ''}
                `}>
                  {done ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>

                {/* Label */}
                <span className={`text-center leading-tight transition-colors ${
                  current ? `text-xs font-semibold ${colors.text}` :
                  done ? 'text-xs text-gray-500' :
                  'text-xs text-gray-300 group-hover:text-gray-500'
                }`} style={{ fontSize: '10px', maxWidth: '64px' }}>
                  {phase.label}
                </span>

                {/* Tooltip */}
                {tooltip === idx && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                    {phase.description}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {saving && <p className="text-xs text-gray-400 text-center mt-3">保存中...</p>}
    </div>
  )
}
