'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface BillingRecord {
  id: string
  billingMonth: string
  amount: number | null
  amountConfirmed: boolean
  status: string
  spreadsheetId: string | null
  spreadsheetUrl: string | null
  generatedAt: string | null
  sentAt: string | null
  sentMethod: string | null
  errorMessage: string | null
}

interface Subscription {
  id: string
  contactId: string
  serviceName: string
  billingType: string
  fixedAmount: number | null
  description: string
  invoiceSubject: string
  status: string
  startDate: string
  endDate: string | null
  notes: string | null
  Contact: { id: string; name: string; company: string | null; email: string | null }
  BillingRecord: BillingRecord[]
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const billingStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  GENERATED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  DOWNLOADED: 'bg-purple-100 text-purple-700',
}

export default function SubscriptionDetailClient({ subscription: initialSub }: { subscription: Subscription }) {
  const router = useRouter()
  const [sub, setSub] = useState(initialSub)
  const [editing, setEditing] = useState(false)
  const [fixedAmount, setFixedAmount] = useState(String(sub.fixedAmount || ''))
  const [saving, setSaving] = useState(false)

  async function handleStatusChange(newStatus: string) {
    if (newStatus === 'CANCELLED' && !confirm('本当に解約しますか？')) return

    const res = await fetch(`/api/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSub({ ...sub, ...updated })
      router.refresh()
    }
  }

  async function handleAmountSave() {
    setSaving(true)
    const res = await fetch(`/api/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixedAmount: parseInt(fixedAmount) }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSub({ ...sub, ...updated })
      setEditing(false)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{sub.serviceName}</h1>
            <Link href={`/contacts/${sub.Contact.id}`} className="text-sm text-blue-600 hover:underline">
              {sub.Contact.name} {sub.Contact.company && `(${sub.Contact.company})`}
            </Link>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColors[sub.status] || ''}`}>
            {sub.status === 'ACTIVE' ? '有効' : sub.status === 'PAUSED' ? '一時停止' : '解約済'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-xs text-gray-500">種別</p>
            <p className="text-sm font-medium">{sub.billingType === 'FIXED' ? '固定額' : '変動額'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">月額</p>
            {sub.billingType === 'FIXED' ? (
              editing ? (
                <div className="flex items-center gap-1">
                  <input type="number" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)}
                    className="w-28 border border-gray-300 rounded px-2 py-1 text-sm" />
                  <button onClick={handleAmountSave} disabled={saving}
                    className="text-xs text-blue-600 hover:underline">保存</button>
                  <button onClick={() => setEditing(false)}
                    className="text-xs text-gray-400 hover:underline">取消</button>
                </div>
              ) : (
                <p className="text-sm font-medium">
                  ¥{(sub.fixedAmount || 0).toLocaleString()}
                  {sub.status === 'ACTIVE' && (
                    <button onClick={() => setEditing(true)} className="text-xs text-blue-500 ml-2 hover:underline">編集</button>
                  )}
                </p>
              )
            ) : (
              <p className="text-sm font-medium text-orange-600">毎月入力</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">開始日</p>
            <p className="text-sm font-medium">{new Date(sub.startDate).toLocaleDateString('ja-JP')}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">メール</p>
            <p className="text-sm">{sub.Contact.email || '未登録'}</p>
          </div>
        </div>

        {sub.notes && (
          <p className="text-sm text-gray-500 mt-3 bg-gray-50 p-2 rounded">{sub.notes}</p>
        )}

        {sub.status === 'ACTIVE' && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => handleStatusChange('PAUSED')}
              className="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-50">
              一時停止
            </button>
            <button onClick={() => handleStatusChange('CANCELLED')}
              className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
              解約
            </button>
          </div>
        )}
        {sub.status === 'PAUSED' && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => handleStatusChange('ACTIVE')}
              className="text-xs px-3 py-1.5 border border-green-300 text-green-700 rounded-lg hover:bg-green-50">
              再開する
            </button>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">📄 請求履歴</h2>
        </div>
        {sub.BillingRecord.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">まだ請求レコードはありません</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">月</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">金額</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">ステータス</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">送信</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {sub.BillingRecord.map(br => (
                <tr key={br.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-sm font-medium">{br.billingMonth}</td>
                  <td className="px-4 py-2 text-sm text-right">
                    {br.amount != null ? `¥${br.amount.toLocaleString()}` : <span className="text-orange-500">未入力</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${billingStatusColors[br.status] || 'bg-gray-100'}`}>
                      {br.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {br.sentAt ? `${new Date(br.sentAt).toLocaleDateString('ja-JP')} (${br.sentMethod})` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {br.spreadsheetUrl && (
                      <a href={br.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline">開く</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
