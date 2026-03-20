'use client'

import { useState } from 'react'

interface InvoiceItem {
  date: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
}

interface InvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  contact: {
    id: string
    name: string
    company: string | null
    email: string | null
  }
  driveFolderId: string | null
  onDriveFolderCreated?: (folderId: string) => void
}

export default function InvoiceModal({ isOpen, onClose, contact, driveFolderId, onDriveFolderCreated }: InvoiceModalProps) {
  const [type, setType] = useState<'invoice' | 'estimate' | 'receipt'>('estimate')
  const [subject, setSubject] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([
    { date: '', description: '', quantity: 1, unit: '式', unitPrice: 0 },
  ])
  const [notes, setNotes] = useState('振込手数料はご負担お願いいたします。')
  const [loading, setLoading] = useState(false)
  const [createdInvoice, setCreatedInvoice] = useState<{
    spreadsheetId: string
    spreadsheetUrl: string
    documentTitle: string
    total: number
    movedToDrive?: boolean
    driveCreated?: boolean
  } | null>(null)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sending, setSending] = useState(false)
  const [driveConfirmOpen, setDriveConfirmOpen] = useState(false)

  const addItem = () => {
    setItems([...items, { date: '', description: '', quantity: 1, unit: '式', unitPrice: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const calculateTotal = () => {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const tax = Math.floor(subtotal * 0.1)
    return { subtotal, tax, total: subtotal + tax }
  }

  const validateForm = () => {
    if (!subject.trim()) {
      alert('件名を入力してください')
      return false
    }
    if (items.length === 0 || items.every(item => !item.description.trim())) {
      alert('明細を入力してください')
      return false
    }
    return true
  }

  const handleCreate = async () => {
    if (!validateForm()) return
    // Driveフォルダがない場合は確認ポップアップ
    if (!driveFolderId) {
      setDriveConfirmOpen(true)
      return
    }
    await createInvoice(false)
  }

  const createInvoice = async (createDriveFolder: boolean) => {
    setDriveConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch('/api/invoice/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          type,
          subject,
          items: items.filter(item => item.description.trim()),
          notes,
          createDriveFolder,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '作成に失敗しました')
      }

      const data = await res.json()
      setCreatedInvoice(data)

      // Driveフォルダが新規作成された場合、親コンポーネントに通知
      if (data.driveCreated && data.driveFolderId && onDriveFolderCreated) {
        onDriveFolderCreated(data.driveFolderId)
      }

      // Set default email content
      const typeLabel = type === 'invoice' ? '請求書' : type === 'receipt' ? '領収書' : '見積書'
      setEmailSubject(`【${contact.company || contact.name}様】${typeLabel}のご送付`)
      setEmailBody(`${contact.company || contact.name}様

お世話になっております。
ライフタイムサポートの龍竹です。

${typeLabel}を添付にてお送りいたします。
ご確認のほど、よろしくお願いいたします。

================================
株式会社ライフタイムサポート
龍竹
TEL: 048-954-9105
================================
`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '作成に失敗しました'
      alert(message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = () => {
    if (!createdInvoice) return
    window.open(`/api/invoice/pdf?spreadsheetId=${createdInvoice.spreadsheetId}`, '_blank')
  }

  const handleSendEmail = async () => {
    if (!createdInvoice || !contact.email) return

    setSending(true)
    try {
      const res = await fetch('/api/invoice/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          spreadsheetId: createdInvoice.spreadsheetId,
          subject: emailSubject,
          body: emailBody,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '送信に失敗しました')
      }

      alert('メールを送信しました')
      setSendModalOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '送信に失敗しました'
      alert(message)
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setCreatedInvoice(null)
    setSendModalOpen(false)
    setType('estimate')
    setSubject('')
    setItems([{ date: '', description: '', quantity: 1, unit: '式', unitPrice: 0 }])
    setNotes('振込手数料はご負担お願いいたします。')
    onClose()
  }

  if (!isOpen) return null

  const { subtotal, tax, total } = calculateTotal()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 text-lg">
            {createdInvoice ? '作成完了' : '見積書・請求書・領収書作成'}
          </h2>
          <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {createdInvoice ? (
            // Created state
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-green-700 font-medium text-lg">✅ {createdInvoice.documentTitle}</p>
                <p className="text-green-600 text-sm mt-1">合計金額: ¥{createdInvoice.total.toLocaleString()}</p>
                {createdInvoice.movedToDrive && (
                  <p className="text-blue-600 text-xs mt-2">📁 Google Driveに自動保存しました{createdInvoice.driveCreated ? '（フォルダも新規作成）' : ''}</p>
                )}
              </div>

              <div className="flex gap-3 justify-center">
                <a
                  href={createdInvoice.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  📄 スプレッドシートを開く
                </a>
                <button
                  onClick={handleDownloadPDF}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  📥 PDFダウンロード
                </button>
                {contact.email && (
                  <button
                    onClick={() => setSendModalOpen(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    ✉️ メール送信
                  </button>
                )}
              </div>

              {/* Send email form */}
              {sendModalOpen && (
                <div className="mt-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <h3 className="font-semibold text-gray-800 mb-3">メール送信</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">宛先</label>
                      <input
                        type="text"
                        value={contact.email || ''}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">件名</label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={e => setEmailSubject(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">本文</label>
                      <textarea
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white resize-y"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setSendModalOpen(false)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={handleSendEmail}
                        disabled={sending}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {sending ? '送信中...' : '送信する'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Creation form
            <div className="space-y-4">
              {/* Type selection */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">種類</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setType('estimate')}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      type === 'estimate'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    見積書
                  </button>
                  <button
                    onClick={() => setType('invoice')}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      type === 'invoice'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    請求書
                  </button>
                  <button
                    onClick={() => setType('receipt')}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      type === 'receipt'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    領収書
                  </button>
                </div>
              </div>

              {/* Customer */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">宛先</label>
                <input
                  type="text"
                  value={`${contact.company || contact.name}様`}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-600"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">件名</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="例：研修受講料として"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400"
                />
              </div>

              {/* Items (見積書・請求書のみ) */}
              {type !== 'receipt' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-500">明細</label>
                      <button
                        onClick={addItem}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        + 行を追加
                      </button>
                    </div>
                    <div className="space-y-2">
                      {items.map((item, index) => (
                        <div key={index} className="flex gap-2 items-start">
                          <input
                            type="text"
                            value={item.date}
                            onChange={e => updateItem(index, 'date', e.target.value)}
                            placeholder="日付"
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white"
                          />
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateItem(index, 'description', e.target.value)}
                            placeholder="内容"
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white"
                          />
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white text-right"
                          />
                          <input
                            type="text"
                            value={item.unit}
                            onChange={e => updateItem(index, 'unit', e.target.value)}
                            className="w-12 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white text-center"
                          />
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={e => updateItem(index, 'unitPrice', parseInt(e.target.value) || 0)}
                            placeholder="単価"
                            className="w-24 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white text-right"
                          />
                          <span className="w-24 text-xs text-gray-600 py-1.5 text-right">
                            ¥{(item.quantity * item.unitPrice).toLocaleString()}
                          </span>
                          {items.length > 1 && (
                            <button
                              onClick={() => removeItem(index)}
                              className="text-red-400 hover:text-red-600 px-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">小計</span>
                      <span className="text-gray-700">¥{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">消費税 (10%)</span>
                      <span className="text-gray-700">¥{tax.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-1">
                      <span className="text-gray-700">合計</span>
                      <span className="text-gray-900">¥{total.toLocaleString()}</span>
                    </div>
                  </div>
                </>
              )}

              {/* 領収書用の金額入力 */}
              {type === 'receipt' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">金額（税込）</label>
                  <input
                    type="number"
                    value={items[0]?.unitPrice || 0}
                    onChange={e => updateItem(0, 'unitPrice', parseInt(e.target.value) || 0)}
                    placeholder="金額を入力"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white text-right"
                  />
                  {items[0]?.unitPrice > 0 && (
                    <p className="text-right text-sm font-bold text-gray-700 mt-2">¥{items[0].unitPrice.toLocaleString()}</p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">備考</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white resize-y"
                />
              </div>
            </div>
          )}
        </div>

        {/* Drive folder confirmation popup */}
        {driveConfirmOpen && (
          <div className="p-4 border-t border-gray-200 bg-yellow-50">
            <p className="text-sm text-gray-800 font-medium mb-1">📁 Google Driveフォルダがありません</p>
            <p className="text-xs text-gray-600 mb-3">このお客様用のDriveフォルダを作成して、作成した書類を自動保存しますか？</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDriveConfirmOpen(false) }}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => createInvoice(false)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50"
              >
                Driveに保存せず作成
              </button>
              <button
                onClick={() => createInvoice(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
              >
                フォルダを作成して保存
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {!createdInvoice && !driveConfirmOpen && (
          <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '作成中...' : '作成する'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
