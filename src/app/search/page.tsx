'use client'

import { useState } from 'react'
import Link from 'next/link'
import { parseRelationships } from '@/lib/relationship-parser'

interface SearchNote {
  id: string
  content: string
  createdAt: string
  category: string
  contact: { id: string; name: string; company: string | null }
}

interface SearchContact {
  id: string
  name: string
  company: string | null
  title: string | null
}

const NOTE_CATEGORIES: Record<string, string> = {
  GENERAL: '一般メモ',
  MEETING: '会議・面談',
  PREFERENCE: '好み・趣味',
  BACKGROUND: '経歴・背景',
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<SearchNote[]>([])
  const [contacts, setContacts] = useState<SearchContact[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)

    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    setNotes(data.notes || [])
    setContacts(data.contacts || [])
    setLoading(false)
  }

  const highlightText = (text: string, query: string) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark>
      ) : (
        part
      )
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">検索</h1>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="メモ・名前・会社名で検索..."
          className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '...' : '検索'}
        </button>
      </div>

      {searched && !loading && (
        <div>
          {contacts.length === 0 && notes.length === 0 ? (
            <p className="text-center text-gray-400 py-12">「{query}」の検索結果はありません</p>
          ) : (
            <div className="space-y-6">
              {contacts.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    👤 人物 ({contacts.length}件)
                  </h2>
                  <div className="space-y-2">
                    {contacts.map(c => (
                      <Link key={c.id} href={`/contacts/${c.id}`}>
                        <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
                          <p className="font-medium text-gray-900">{highlightText(c.name, query)}</p>
                          {c.company && <p className="text-xs text-blue-600">{c.company}</p>}
                          {c.title && <p className="text-xs text-gray-500">{c.title}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {notes.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    📝 メモ ({notes.length}件)
                  </h2>
                  <div className="space-y-2">
                    {notes.map(note => (
                      <Link key={note.id} href={`/contacts/${note.contact.id}`}>
                        <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-gray-900 text-sm">
                              {note.contact.name}
                            </span>
                            {note.contact.company && (
                              <span className="text-xs text-blue-600">{note.contact.company}</span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto">
                              {new Date(note.createdAt).toLocaleDateString('ja-JP')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {highlightText(note.content, query)}
                          </p>
                          <span className="text-xs text-gray-400 mt-1 block">
                            {NOTE_CATEGORIES[note.category] || note.category}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!searched && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🔍</p>
          <p>キーワードを入力して検索してください</p>
          <p className="text-sm mt-1">メモの内容・名前・会社名から検索できます</p>
        </div>
      )}
    </div>
  )
}
