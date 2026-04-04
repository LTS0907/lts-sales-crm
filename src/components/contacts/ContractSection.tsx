'use client'

import { useState, useEffect } from 'react'
import SendContractModal from './SendContractModal'

interface Contract {
  id: string
  templateName: string
  status: string
  sentAt: string
  viewedAt: string | null
  signedAt: string | null
  signingToken: string
}

interface ContractSectionProps {
  contact: {
    id: string
    name: string
    company: string | null
    email: string | null
    driveFolderId: string | null
  }
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  SENT: { label: '送信済み', color: 'bg-blue-100 text-blue-700' },
  VIEWED: { label: '閲覧済み', color: 'bg-yellow-100 text-yellow-700' },
  SIGNED: { label: '署名完了', color: 'bg-green-100 text-green-700' },
}

export default function ContractSection({ contact }: ContractSectionProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (contractId: string) => {
    if (!confirm('この契約書を削除しますか？')) return
    setDeleting(contractId)
    try {
      const res = await fetch('/api/contracts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId }),
      })
      const data = await res.json()
      if (data.success) {
        fetchContracts()
      } else {
        alert(data.error || '削除に失敗しました')
      }
    } catch {
      alert('削除に失敗しました')
    } finally {
      setDeleting(null)
    }
  }

  const fetchContracts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contracts?contactId=${contact.id}`)
      const data = await res.json()
      setContracts(data.contracts || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchContracts() }, [contact.id])

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">契約書</h3>
        <button
          onClick={() => setModalOpen(true)}
          disabled={!contact.email}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          契約書を送信
        </button>
      </div>

      {!contact.email && (
        <p className="text-sm text-orange-600 mb-4">
          メールアドレスが未登録のため、契約書を送信できません。
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-gray-500">送信済みの契約書はありません。</p>
      ) : (
        <div className="space-y-3">
          {contracts.map(c => {
            const badge = STATUS_BADGE[c.status] || STATUS_BADGE.SENT
            return (
              <div key={c.id} className="p-4 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-800 text-sm">
                    {c.templateName.replace(/\.pdf$/, '').trim()}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>送信: {formatDate(c.sentAt)}</span>
                  <span>閲覧: {formatDate(c.viewedAt)}</span>
                  <span>署名: {formatDate(c.signedAt)}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {c.status !== 'SIGNED' && (
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => {
                        const url = `${window.location.origin}/sign/${c.signingToken}`
                        navigator.clipboard.writeText(url)
                        alert('署名リンクをコピーしました')
                      }}
                    >
                      署名リンクをコピー
                    </button>
                  )}
                  <button
                    className="text-xs text-red-500 hover:underline"
                    disabled={deleting === c.id}
                    onClick={() => handleDelete(c.id)}
                  >
                    {deleting === c.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SendContractModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        contact={contact}
        onSent={fetchContracts}
      />
    </div>
  )
}
