'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OWNER_CONFIG, OWNER_OPTIONS, type Owner } from './OwnerBadge'

export default function OwnerSelector({
  contactId,
  currentOwner,
}: {
  contactId: string
  currentOwner: Owner | string
}) {
  const router = useRouter()
  const [owner, setOwner] = useState<Owner>(
    (currentOwner === 'KABASHIMA' || currentOwner === 'SHARED') ? currentOwner : 'KAZUI'
  )
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const config = OWNER_CONFIG[owner]

  const changeOwner = async (newOwner: Owner) => {
    if (newOwner === owner) { setOpen(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: newOwner }),
      })
      if (res.ok) {
        setOwner(newOwner)
        setOpen(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors hover:brightness-95 ${config.bgColor} ${config.color} ${config.borderColor}`}
      >
        <span>{config.icon}</span>
        <span>{config.shortLabel}</span>
        <span className="text-xs opacity-60 ml-1">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px]">
            {OWNER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => changeOwner(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  owner === opt.value ? 'bg-gray-50 font-semibold' : ''
                }`}
              >
                {opt.label}
                {owner === opt.value && <span className="ml-2 text-green-600">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
