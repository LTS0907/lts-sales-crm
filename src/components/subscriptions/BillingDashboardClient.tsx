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
  Subscription: {
    id: string
    serviceName: string
    billingType: string
    description: string
    invoiceSubject: string
    Contact: { id: string; name: string; company: string | null; email: string | null }
  }
}

const statusStyles: Record<string, { label: string; color: string }> = {
  PENDING: { label: '未生成', color: 'bg-yellow-100 text-yellow-700' },
  GENERATED: { label: '生成済', color: 'bg-blue-100 text-blue-700' },
  SENT: { label: '送信済', color: 'bg-green-100 text-green-700' },
  DOWNLOADED: { label: 'DL済', color: 'bg-purple-100 text-purple-700' },
}

export default function BillingDashboardClient({
  records: initialRecords,
  currentMonth,
}: {
  records: BillingRecord[]
  currentMonth: string
}) {
  const router = useRouter()
  const [records, setRecords] = useState(initialRecords)
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [sendModal, setSendModal] = useState<BillingRecord | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sending, setSending] = useState(false)

  // Month navigation
  function changeMonth(delta: number) {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    router.push(`/subscriptions/billing?month=${newMonth}`)
  }

  // Set amount for variable billing
  async function confirmAmount(recordId: string) {
    const amount = parseInt(amountInputs[recordId])
    if (!amount || amount <= 0) return

    setLoading(prev => ({ ...prev, [recordId]: true }))
    const res = await fetch(`/api/subscriptions/billing/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updated } : r))
    }
    setLoading(prev => ({ ...prev, [recordId]: false }))
  }

  // Generate single invoice
  async function generateInvoice(recordId: string) {
    setLoading(prev => ({ ...prev, [recordId]: true }))
    const res = await fetch(`/api/subscriptions/billing/${recordId}/generate`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...data.billingRecord } : r))
    } else {
      const err = await res.json()
      alert(`エラー: ${err.error}`)
    }
    setLoading(prev => ({ ...prev, [recordId]: false }))
  }

  // Batch generate all confirmed pending invoices
  async function batchGenerate() {
    setBatchGenerating(true)
    const res = await fetch('/api/subscriptions/billing/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: currentMonth }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      const err = await res.json()
      alert(`エラー: ${err.error}`)
    }
    setBatchGenerating(false)
  }

  // Download PDF
  async function downloadPdf(record: BillingRecord) {
    if (!record.spreadsheetId) return
    window.open(`/api/invoice/pdf?spreadsheetId=${record.spreadsheetId}`, '_blank')

    // Mark as downloaded
    await fetch(`/api/subscriptions/billing/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DOWNLOADED', sentMethod: 'PDF_DOWNLOAD' }),
    })
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: 'DOWNLOADED', sentMethod: 'PDF_DOWNLOAD' } : r))
  }

  // Open send modal
  function openSendModal(record: BillingRecord) {
    const contact = record.Subscription.Contact
    const [y, m] = record.billingMonth.split('-').map(Number)
    setEmailSubject(`${record.Subscription.invoiceSubject}（${y}年${m}月分）のご請求`)
    setEmailBody(
      `${contact.company || contact.name}　${contact.name}様\n\n` +
      `いつもお世話になっております。\n株式会社ライフタイムサポートの龍竹です。\n\n` +
      `${y}年${m}月分の請求書を添付いたします。\nご確認のほど、よろしくお願いいたします。\n\n` +
      `振込手数料はご負担お願いいたします。\n\n` +
      `株式会社ライフタイムサポート\n龍竹\nTEL: 048-954-9105`
    )
    setSendModal(record)
  }

  // Send email
  async function handleSend() {
    if (!sendModal) return
    setSending(true)
    const res = await fetch(`/api/subscriptions/billing/${sendModal.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: emailSubject, body: emailBody }),
    })
    if (res.ok) {
      setRecords(prev => prev.map(r => r.id === sendModal.id ? { ...r, status: 'SENT', sentMethod: 'EMAIL' } : r))
      setSendModal(null)
    } else {
      const err = await res.json()
      alert(`送信エラー: ${err.error}`)
    }
    setSending(false)
  }

  const pendingConfirmed = records.filter(r => r.status === 'PENDING' && r.amountConfirmed).length

  return (
    <>
      {/* Month selector + batch actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">←</button>
          <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">{currentMonth}</span>
          <button onClick={() => changeMonth(1)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">→</button>
        </div>
        {pendingConfirmed > 0 && (
          <button onClick={batchGenerate} disabled={batchGenerating}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {batchGenerating ? '生成中...' : `一括生成（${pendingConfirmed}件）`}
          </button>
        )}
      </div>

      {/* Records table */}
      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">
          この月の請求レコードはありません
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">顧客</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">サービス</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">金額</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">ステータス</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">アクション</th>
              </tr>
            </thead>
            <tbody>
              {records.map(record => {
                const contact = record.Subscription.Contact
                const st = statusStyles[record.status] || { label: record.status, color: 'bg-gray-100' }
                const isLoading = loading[record.id]

                return (
                  <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${contact.id}`} className="hover:underline">
                        <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                        {contact.company && <p className="text-xs text-gray-500">{contact.company}</p>}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{record.Subscription.serviceName}</p>
                      <p className="text-xs text-gray-400">{record.Subscription.billingType === 'FIXED' ? '固定' : '変動'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!record.amountConfirmed ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-gray-400 text-sm">¥</span>
                          <input
                            type="number"
                            value={amountInputs[record.id] || ''}
                            onChange={e => setAmountInputs(prev => ({ ...prev, [record.id]: e.target.value }))}
                            placeholder="金額"
                            className="w-28 border border-orange-300 rounded px-2 py-1 text-sm text-right bg-orange-50"
                          />
                          <button onClick={() => confirmAmount(record.id)} disabled={isLoading}
                            className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                            確定
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium">¥{(record.amount || 0).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      {record.errorMessage && (
                        <p className="text-xs text-red-500 mt-1" title={record.errorMessage}>エラー</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {record.status === 'PENDING' && record.amountConfirmed && (
                          <button onClick={() => generateInvoice(record.id)} disabled={isLoading}
                            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {isLoading ? '...' : '生成'}
                          </button>
                        )}
                        {(record.status === 'GENERATED' || record.status === 'SENT' || record.status === 'DOWNLOADED') && (
                          <>
                            {record.status === 'GENERATED' && contact.email && (
                              <button onClick={() => openSendModal(record)}
                                className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700">
                                メール送信
                              </button>
                            )}
                            <button onClick={() => downloadPdf(record)}
                              className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                              PDF
                            </button>
                            {record.spreadsheetUrl && (
                              <a href={record.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs px-2 py-1.5 text-blue-600 hover:underline">
                                GS
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Send Email Modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold">メール送信</h3>
            <p className="text-sm text-gray-500">
              {sendModal.Subscription.Contact.name}（{sendModal.Subscription.Contact.email}）
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">件名</label>
              <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                rows={8} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setSendModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                キャンセル
              </button>
              <button onClick={handleSend} disabled={sending}
                className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                {sending ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
