'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SUBSCRIPTION_SERVICES } from '@/lib/subscription-services'

interface Contact {
  id: string
  name: string
  company: string | null
  email: string | null
  salesPhase: string
}

// CRM パイプラインのラベルと整合（PipelineBoard.tsx と同じ用語）
const PHASE_LABELS: Record<string, string> = {
  LEAD: 'リード',
  MAIL_SENT: 'メール送信',
  INTERESTED: '興味あり',
  APPOINTMENT: 'アポ調整',
  MEETING_DONE: 'アポ完了',
  PROPOSING: '提案中',
  NEEDS_CONFIRM: 'ニーズ確認',
  PLAN_PROPOSED: '提案済み',
  NEGOTIATING: '商談中',
  SURVEY: 'ヒアリング',
  SCHEDULE_CONFIRM: '日程確認',
  LABOR_CONFIRM: '社労士確認',
  QUOTED: '見積提出',
  CONTRACTED: '入金待ち',
  PAID: '入金完了',
  STARTED: '開始済',
  DELIVERED: '納品済',
  NURTURING: '育成中',
  COMPLETED: '終了',
  LOST: '失注',
}

function phaseBadgeClass(phase: string): string {
  if (phase === 'PAID') return 'bg-emerald-100 text-emerald-700'
  if (phase === 'CONTRACTED') return 'bg-green-100 text-green-700'
  if (['STARTED', 'DELIVERED'].includes(phase)) return 'bg-blue-100 text-blue-700'
  if (phase === 'COMPLETED') return 'bg-purple-100 text-purple-700'
  if (phase === 'LOST') return 'bg-red-100 text-red-600'
  if (phase === 'NURTURING') return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-600'
}

type BillingCycle = 'MONTHLY' | 'YEARLY'

export default function SubscriptionForm({ contacts }: { contacts: Contact[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const [serviceKey, setServiceKey] = useState(SUBSCRIPTION_SERVICES[0].key)
  const [customServiceName, setCustomServiceName] = useState('')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY')
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
  const isCustom = selectedService.isCustom === true

  const filteredContacts = contacts.filter(c => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q)
  })

  function handleServiceChange(key: string) {
    setServiceKey(key)
    const svc = SUBSCRIPTION_SERVICES.find(s => s.key === key)!
    setDescription(svc.defaultDescription)
    setInvoiceSubject(svc.defaultSubject)
    if (!svc.isCustom) {
      setCustomServiceName('')
    }
  }

  const amountLabel = billingCycle === 'YEARLY' ? '年額（税抜） *' : '月額（税抜） *'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContact) { setError('顧客を選択してください'); return }
    if (isCustom && !customServiceName.trim()) { setError('サービス名を入力してください'); return }
    if (isFixed && !fixedAmount) { setError(`${billingCycle === 'YEARLY' ? '年額' : '月額'}を入力してください`); return }

    setSaving(true)
    setError('')

    const resolvedServiceName = isCustom ? customServiceName.trim() : selectedService.label

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.id,
          serviceName: resolvedServiceName,
          billingType: selectedService.defaultBillingType,
          billingCycle,
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                <span className="truncate">{selectedContact.name}</span>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${phaseBadgeClass(selectedContact.salesPhase)}`}>
                  {PHASE_LABELS[selectedContact.salesPhase] || selectedContact.salesPhase}
                </span>
              </p>
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
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {filteredContacts.slice(0, 30).map(c => (
                  <button key={c.id} type="button"
                    onClick={() => { setSelectedContact(c); setShowDropdown(false); setSearch('') }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-medium">{c.name}</span>
                      {c.company && <span className="text-gray-500 ml-2">{c.company}</span>}
                    </span>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${phaseBadgeClass(c.salesPhase)}`}>
                      {PHASE_LABELS[c.salesPhase] || c.salesPhase}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && filteredContacts.length === 0 && search && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500">
                該当する顧客が見つかりません
              </div>
            )}
          </div>
        )}
      </div>

      {/* Service selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">サービス *</label>
        <div className="grid grid-cols-3 gap-2">
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
                {svc.isCustom ? 'カスタム' : svc.defaultBillingType === 'FIXED' ? '固定額' : '変動額'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom service name (shown only for "その他") */}
      {isCustom && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">サービス名 *</label>
          <input
            type="text"
            value={customServiceName}
            onChange={e => setCustomServiceName(e.target.value)}
            placeholder="例: 単発開発費用"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Billing cycle selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">支払いサイクル *</label>
        <div className="flex gap-3">
          {(['MONTHLY', 'YEARLY'] as BillingCycle[]).map(cycle => (
            <label key={cycle} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="billingCycle"
                value={cycle}
                checked={billingCycle === cycle}
                onChange={() => setBillingCycle(cycle)}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">{cycle === 'MONTHLY' ? '月次' : '年次'}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Fixed amount */}
      {isFixed && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{amountLabel}</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">¥</span>
            <input
              type="number"
              value={fixedAmount}
              onChange={e => setFixedAmount(e.target.value)}
              placeholder={billingCycle === 'YEARLY' ? '1800000' : '150000'}
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
