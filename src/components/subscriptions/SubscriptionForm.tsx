'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SUBSCRIPTION_SERVICES } from '@/lib/subscription-services'

interface Contact {
  id: string
  name: string
  company: string | null
  email: string | null
}

export default function SubscriptionForm({ contacts }: { contacts: Contact[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const [serviceKey, setServiceKey] = useState(SUBSCRIPTION_SERVICES[0].key)
  const [fixedAmount, setFixedAmount] = useState('')
  const [description, setDescription] = useState(SUBSCRIPTION_SERVICES[0].defaultDescription)
  const [invoiceSubject, setInvoiceSubject] = useState(SUBSCRIPTION_SERVICES[0].defaultSubject)
  const [startDate, setStartDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [notes, setNotes] = useState('')

  const selectedService = SUBSCRIPTION_SERVICES.find(s => s.key === serviceKey)!
  const isFixed = selectedService.defaultBillingType === 'FIXED'

  const filteredContacts = contacts.filter(c => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q)
  })

  function handleServiceChange(key: string) {
    setServiceKey(key)
    const svc = SUBSCRIPTION_SERVICES.find(s => s.key === key)!
    setDescription(svc.defaultDescription)
    setInvoiceSubject(svc.defaultSubject)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContact) { setError('顧客を選択してください'); return }
    if (isFixed && !fixedAmount) { setError('月額を入力してください'); return }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.id,
          serviceName: selectedService.label,
          billingType: selectedService.defaultBillingType,
          fixedAmount: isFixed ? parseInt(fixedAmount) : null,
          description,
          invoiceSubject,
          startDate,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create')
      }

      router.push('/subscriptions')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Contact selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">顧客 *</label>
        {selectedContact ? (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex-1">
              <p className="text-sm font-medium">{selectedContact.name}</p>
              {selectedContact.company && <p className="text-xs text-gray-500">{selectedContact.company}</p>}
            </div>
            <button type="button" onClick={() => { setSelectedContact(null); setSearch('') }}
              className="text-xs text-red-500 hover:underline">変更</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="顧客名で検索..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {showDropdown && filteredContacts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredContacts.slice(0, 20).map(c => (
                  <button key={c.id} type="button"
                    onClick={() => { setSelectedContact(c); setShowDropdown(false); setSearch('') }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.company && <span className="text-gray-500 ml-2">{c.company}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Service selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">サービス *</label>
        <div className="grid grid-cols-2 gap-2">
          {SUBSCRIPTION_SERVICES.map(svc => (
            <button key={svc.key} type="button"
              onClick={() => handleServiceChange(svc.key)}
              className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                serviceKey === svc.key
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
              <p className="font-medium">{svc.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {svc.defaultBillingType === 'FIXED' ? '固定額' : '変動額'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Fixed amount */}
      {isFixed && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">月額（税抜） *</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">¥</span>
            <input
              type="number"
              value={fixedAmount}
              onChange={e => setFixedAmount(e.target.value)}
              placeholder="150000"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Description & Subject */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">明細テキスト</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">請求書件名</label>
          <input
            type="text"
            value={invoiceSubject}
            onChange={e => setInvoiceSubject(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Start date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">請求開始月 *</label>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="内部メモ（任意）"
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          キャンセル
        </button>
        <button type="submit" disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? '登録中...' : '登録する'}
        </button>
      </div>
    </form>
  )
}
