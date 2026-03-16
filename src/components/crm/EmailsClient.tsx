'use client'
import { useState } from 'react'
import Link from 'next/link'

const STATUSES = [
  { value: 'DRAFTED', label: '下書き済', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'APPROVED', label: '送信許可', color: 'bg-blue-100 text-blue-700' },
  { value: 'SENT', label: '送信済み', color: 'bg-green-100 text-green-700' },
]

export default function EmailsClient({ contacts: initial }: { contacts: any[] }) {
  const [contacts, setContacts] = useState(initial)
  const [filter, setFilter] = useState<string>('ALL')

  const filtered = filter === 'ALL' ? contacts : contacts.filter(c => c.emailStatus === filter)

  const approve = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailStatus: 'APPROVED' }) })
    setContacts(cs => cs.map(c => c.id === id ? { ...c, emailStatus: 'APPROVED' } : c))
  }

  const markSent = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailStatus: 'SENT', emailSentAt: new Date().toISOString() }) })
    setContacts(cs => cs.map(c => c.id === id ? { ...c, emailStatus: 'SENT' } : c))
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">メール管理</h1>

      <div className="flex gap-2 mb-5">
        {[{ value: 'ALL', label: `すべて (${contacts.length})` }, ...STATUSES.map(s => ({ value: s.value, label: `${s.label} (${contacts.filter(c => c.emailStatus === s.value).length})` }))].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${filter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-3">📭</p><p>該当するメールはありません</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const status = STATUSES.find(s => s.value === c.emailStatus)
            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link href={`/contacts/${c.id}`} className="font-semibold text-gray-900 hover:text-blue-600">{c.name}</Link>
                    {c.company && <span className="text-sm text-gray-500 ml-2">{c.company}</span>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${status?.color}`}>{status?.label}</span>
                </div>
                {c.emailSubject && <p className="text-sm font-medium text-gray-800 mb-1">{c.emailSubject}</p>}
                {c.emailBody && <p className="text-sm text-gray-600 line-clamp-3 whitespace-pre-wrap">{c.emailBody}</p>}
                <div className="flex gap-2 mt-3">
                  <Link href={`/contacts/${c.id}`} className="px-3 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">詳細・編集</Link>
                  {c.emailStatus === 'DRAFTED' && <button onClick={() => approve(c.id)} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">送信許可</button>}
                  {c.emailStatus === 'APPROVED' && <button onClick={() => markSent(c.id)} className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">送信済みにする</button>}
                  {c.emailStatus === 'APPROVED' && c.email && (
                    <a href={`mailto:${c.email}?subject=${encodeURIComponent(c.emailSubject || '')}&body=${encodeURIComponent(c.emailBody || '')}`}
                      className="px-3 py-1 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600">メーラーで開く</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
