'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SUBSCRIPTION_SERVICES } from '@/lib/subscription-services'

interface BillingRecord {
  id: string
  billingMonth: string
  amount: number | null
  status: string
  spreadsheetUrl: string | null
  sentAt: string | null
  sentMethod: string | null
}

interface Subscription {
  id: string
  serviceName: string
  billingType: string
  fixedAmount: number | null
  description: string
  invoiceSubject: string
  status: string
  startDate: string
  endDate: string | null
  notes: string | null
  BillingRecord: BillingRecord[]
}

interface Contact {
  id: string
  name: string
  company: string | null
  email: string | null
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const statusLabels: Record<string, string> = {
  ACTIVE: '有効',
  PAUSED: '一時停止',
  CANCELLED: '解約済',
}

const billingStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  GENERATED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  DOWNLOADED: 'bg-purple-100 text-purple-700',
}

export default function ContactSubscriptionSection({
  contact,
  subscriptions: initialSubs,
}: {
  contact: Contact
  subscriptions: Subscription[]
}) {
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState(initialSubs)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
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

  function handleServiceChange(key: string) {
    setServiceKey(key)
    const svc = SUBSCRIPTION_SERVICES.find(s => s.key === key)!
    setDescription(svc.defaultDescription)
    setInvoiceSubject(svc.defaultSubject)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isFixed && !fixedAmount) { setError('月額を入力してください'); return }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
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

      const newSub = await res.json()
      setSubscriptions([{ ...newSub, BillingRecord: [] }, ...subscriptions])
      setShowForm(false)
      resetForm()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setServiceKey(SUBSCRIPTION_SERVICES[0].key)
    setFixedAmount('')
    setDescription(SUBSCRIPTION_SERVICES[0].defaultDescription)
    setInvoiceSubject(SUBSCRIPTION_SERVICES[0].defaultSubject)
    setNotes('')
    setError('')
  }

  async function handleStatusChange(subId: string, newStatus: string) {
    if (newStatus === 'CANCELLED' && !confirm('本当に解約しますか？')) return

    const res = await fetch(`/api/subscriptions/${subId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSubscriptions(subscriptions.map(s => s.id === subId ? { ...s, ...updated } : s))
      router.refresh()
    }
  }

  const activeSubs = subscriptions.filter(s => s.status === 'ACTIVE')
  const otherSubs = subscriptions.filter(s => s.status !== 'ACTIVE')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-900">サブスクリプション</h3>
          {activeSubs.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {activeSubs.length}件 有効
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm() }}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            showForm
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {showForm ? 'キャンセル' : '+ 新規登録'}
        </button>
      </div>

      {/* New Subscription Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-medium text-blue-900">
            {contact.name} のサブスク登録
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Service selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">サービス</label>
            <div className="grid grid-cols-2 gap-2">
              {SUBSCRIPTION_SERVICES.map(svc => (
                <button key={svc.key} type="button"
                  onClick={() => handleServiceChange(svc.key)}
                  className={`p-2.5 rounded-lg border text-sm text-left transition-colors ${
                    serviceKey === svc.key
                      ? 'border-blue-500 bg-white text-blue-700'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                  <p className="font-medium text-xs">{svc.label}</p>
                  <p className="text-[10px] text-gray-500">
                    {svc.defaultBillingType === 'FIXED' ? '固定額' : '変動額'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Fixed amount */}
          {isFixed && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">月額（税抜）</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">¥</span>
                <input
                  type="number"
                  value={fixedAmount}
                  onChange={e => setFixedAmount(e.target.value)}
                  placeholder="150000"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          )}

          {/* Description & Subject */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">明細テキスト</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">請求書件名</label>
              <input type="text" value={invoiceSubject} onChange={e => setInvoiceSubject(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>

          {/* Start date & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">請求開始月</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="内部メモ" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
      )}

      {/* Subscription List */}
      {subscriptions.length === 0 && !showForm ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">サブスク契約はまだありません</p>
          <button onClick={() => setShowForm(true)}
            className="mt-3 text-xs text-blue-600 hover:underline">
            最初のサブスクを登録する
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {[...activeSubs, ...otherSubs].map(sub => (
            <div key={sub.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/subscriptions/${sub.id}`}
                      className="text-sm font-bold text-gray-900 hover:text-blue-600">
                      {sub.serviceName}
                    </Link>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[sub.status] || ''}`}>
                      {statusLabels[sub.status] || sub.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>{sub.billingType === 'FIXED' ? `¥${(sub.fixedAmount || 0).toLocaleString()}/月` : '変動額'}</span>
                    <span>開始: {new Date(sub.startDate).toLocaleDateString('ja-JP')}</span>
                    {sub.description && <span>{sub.description}</span>}
                  </div>
                </div>

                {/* Status actions */}
                {sub.status === 'ACTIVE' && (
                  <div className="flex gap-1">
                    <button onClick={() => handleStatusChange(sub.id, 'PAUSED')}
                      className="text-[10px] px-2 py-1 border border-yellow-300 text-yellow-700 rounded hover:bg-yellow-50">
                      停止
                    </button>
                    <button onClick={() => handleStatusChange(sub.id, 'CANCELLED')}
                      className="text-[10px] px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50">
                      解約
                    </button>
                  </div>
                )}
                {sub.status === 'PAUSED' && (
                  <button onClick={() => handleStatusChange(sub.id, 'ACTIVE')}
                    className="text-[10px] px-2 py-1 border border-green-300 text-green-700 rounded hover:bg-green-50">
                    再開
                  </button>
                )}
              </div>

              {/* Recent billing records */}
              {sub.BillingRecord.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">直近の請求</p>
                  <div className="flex gap-2 flex-wrap">
                    {sub.BillingRecord.map(br => (
                      <div key={br.id} className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-600">{br.billingMonth}</span>
                        <span className="text-gray-900 font-medium">
                          {br.amount != null ? `¥${br.amount.toLocaleString()}` : '未入力'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${billingStatusColors[br.status] || 'bg-gray-100'}`}>
                          {br.status}
                        </span>
                        {br.spreadsheetUrl && (
                          <a href={br.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline">開く</a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sub.notes && (
                <p className="mt-2 text-xs text-gray-400 bg-gray-50 p-1.5 rounded">{sub.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
