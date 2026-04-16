'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import OwnerBadge, { type Owner } from './OwnerBadge'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  UNSENT:  { label: '未送信', color: 'bg-gray-100 text-gray-600' },
  DRAFTED: { label: '下書き', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED:{ label: '送信許可', color: 'bg-blue-100 text-blue-700' },
  SENT:    { label: '送信済', color: 'bg-green-100 text-green-700' },
}

const SERVICE_COLORS: Record<string, string> = {
  '生成AI活用セミナー':     'bg-blue-100 text-blue-700',
  'AIパーソナルトレーニング':'bg-purple-100 text-purple-700',
  'IT内製化支援':           'bg-green-100 text-green-700',
  'マーケティング支援':     'bg-orange-100 text-orange-700',
  'デバイス販売':           'bg-gray-100 text-gray-700',
  'その他':                 'bg-pink-100 text-pink-700',
}

const CONNECTION_LABELS: Record<string, { label: string; icon: string }> = {
  PERSONAL:    { label: '個人として出会った', icon: '👤' },
  BUSINESS:    { label: '会社として出会った', icon: '🏢' },
  NETWORKING:  { label: '勉強会・セミナーで', icon: '🤝' },
  ONLINE:      { label: 'オンラインで',       icon: '💻' },
  OTHER:       { label: 'その他',             icon: '📌' },
}

type GroupMode = 'company' | 'prefecture' | 'service' | 'connection'

function extractPrefecture(address: string | null): string {
  if (!address) return 'その他'
  const clean = address.replace(/〒\d{3}-\d{4}\s*/, '')
  const match = clean.match(/^(東京都|大阪府|京都府|北海道|.{2,3}県)/)
  return match ? match[1] : 'その他'
}

function groupContacts(contacts: any[], mode: GroupMode): [string, any[]][] {
  const map = new Map<string, any[]>()

  for (const c of contacts) {
    let keys: string[] = []

    if (mode === 'company') {
      keys = [c.company || 'その他']
    } else if (mode === 'prefecture') {
      keys = [extractPrefecture(c.address)]
    } else if (mode === 'service') {
      if (c.recommendedServices) {
        keys = c.recommendedServices.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      if (keys.length === 0) keys = ['未設定']
    } else if (mode === 'connection') {
      keys = [c.connectionType || 'OTHER']
    }

    for (const key of keys) {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
  }

  return Array.from(map.entries()).sort((a, b) => {
    if (a[0] === 'その他' || a[0] === '未設定') return 1
    if (b[0] === 'その他' || b[0] === '未設定') return -1
    return b[1].length - a[1].length
  })
}

function groupLabel(mode: GroupMode, key: string): string {
  if (mode === 'connection') {
    return CONNECTION_LABELS[key]?.label || key
  }
  return key
}

function groupIcon(mode: GroupMode, key: string): string {
  if (mode === 'company')    return '🏢'
  if (mode === 'prefecture') return '📍'
  if (mode === 'connection') return CONNECTION_LABELS[key]?.icon || '📌'
  return SERVICE_COLORS[key] ? '✦' : '📂'
}

const SCROLL_KEY = 'contacts-scroll-position'

// Get the main scrollable element (the <main> tag in layout.tsx)
function getScrollContainer(): Element | null {
  return document.querySelector('main')
}

type OwnerFilter = 'ALL' | Owner

export default function ContactsClient({ contacts }: { contacts: any[] }) {
  const [mode, setMode] = useState<GroupMode>('company')
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('ALL')

  const filteredContacts = ownerFilter === 'ALL'
    ? contacts
    : contacts.filter(c => (c.owner || 'KAZUI') === ownerFilter)

  const groups = groupContacts(filteredContacts, mode)

  const modes: { key: GroupMode; label: string }[] = [
    { key: 'company',    label: '会社別' },
    { key: 'prefecture', label: '都道府県別' },
    { key: 'service',    label: 'サービス別' },
    { key: 'connection', label: 'つながり別' },
  ]

  const ownerFilters: { key: OwnerFilter; label: string; activeClass: string }[] = [
    { key: 'ALL',       label: '全員',       activeClass: 'bg-gray-700 text-white' },
    { key: 'KAZUI',     label: '👤 龍竹',    activeClass: 'bg-blue-600 text-white' },
    { key: 'KABASHIMA', label: '🌙 樺嶋',    activeClass: 'bg-purple-600 text-white' },
    { key: 'SHARED',    label: '🤝 共同',    activeClass: 'bg-green-600 text-white' },
  ]

  // Restore scroll position on mount
  useEffect(() => {
    const savedPosition = sessionStorage.getItem(SCROLL_KEY)
    if (savedPosition) {
      const pos = parseInt(savedPosition, 10)
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const container = getScrollContainer()
        if (container) {
          container.scrollTop = pos
        }
      })
    }
  }, [])

  // Save scroll position before leaving
  useEffect(() => {
    const container = getScrollContainer()
    if (!container) return

    const handleScroll = () => {
      sessionStorage.setItem(SCROLL_KEY, String(container.scrollTop))
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      {/* 担当者フィルター */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {ownerFilters.map(f => {
          const count = f.key === 'ALL' ? contacts.length : contacts.filter(c => (c.owner || 'KAZUI') === f.key).length
          return (
            <button
              key={f.key}
              onClick={() => setOwnerFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                ownerFilter === f.key
                  ? f.activeClass + ' border-transparent'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {f.label} <span className="opacity-75">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Group mode selector */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {modes.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              mode === m.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400 self-center">表示中 {filteredContacts.length} / 合計 {contacts.length}名</span>
      </div>

      {/* Groups */}
      <div className="space-y-6">
        {groups.map(([key, members]) => (
          <div key={key}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>{groupIcon(mode, key)}</span>
              <span>{groupLabel(mode, key)}</span>
              <span className="bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500 font-normal normal-case">
                {members.length}名
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((c: any) => <ContactCard key={c.id} contact={c} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function ContactCard({ contact }: { contact: any }) {
  const status = STATUS_LABEL[contact.emailStatus] || STATUS_LABEL.UNSENT
  return (
    <Link href={`/contacts/${contact.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold flex-shrink-0 overflow-hidden">
            {contact.photoPath
              ? <img src={contact.photoPath} className="w-full h-full object-cover" alt="" />
              : contact.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{contact.name}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>{status.label}</span>
            </div>
            {contact.title && <p className="text-xs text-gray-500 truncate">{contact.title}</p>}
            {contact.company && <p className="text-xs text-blue-600 truncate">{contact.company}</p>}
            <div className="mt-1"><OwnerBadge owner={contact.owner} size="xs" /></div>
          </div>
        </div>
        {contact.recommendedServices && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.recommendedServices.split(',').map((s: string) => {
              const label = s.trim()
              if (!label) return null
              return (
                <span key={label} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SERVICE_COLORS[label] || 'bg-gray-100 text-gray-600'}`}>
                  {label}
                </span>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {contact._count?.Note > 0 && <span>📝 {contact._count.Note}件</span>}
          {contact.connectionType && CONNECTION_LABELS[contact.connectionType] && (
            <span>{CONNECTION_LABELS[contact.connectionType].icon} {CONNECTION_LABELS[contact.connectionType].label}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
