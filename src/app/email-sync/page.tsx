'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import Link from 'next/link'

interface EmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  fromEmail: string
  fromDomain: string
  to: string
  toEmail: string
  toDomain: string
  date: string
  snippet: string
  isIncoming: boolean
}

interface MatchedContact {
  id: string
  name: string
  company: string | null
  email: string | null
  domain: string
  emails: EmailMessage[]
  latestEmailDate: string
}

interface MatchData {
  myEmail: string
  myDomain: string
  matchedContacts: MatchedContact[]
  unmatchedDomains: string[]
  totalEmails: number
}

export default function EmailSyncPage() {
  const { data: session, status } = useSession()
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<MatchedContact | null>(null)
  const [daysBack, setDaysBack] = useState(30)
  const [addingExchange, setAddingExchange] = useState<string | null>(null)

  const fetchMatchedEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gmail/match?daysBack=${daysBack}&maxResults=200`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'メール取得に失敗しました')
      }
      const data = await res.json()
      setMatchData(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'エラーが発生しました'
      if (message.includes('insufficient') || message.includes('Insufficient Permission')) {
        setError('Gmail権限エラー: 一度ログアウトして再ログインしてください。')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const addToExchange = async (contact: MatchedContact, email: EmailMessage) => {
    setAddingExchange(email.id)
    try {
      const res = await fetch('/api/gmail/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          emailId: email.id,
          subject: email.subject,
          snippet: email.snippet,
          date: email.date,
          isIncoming: email.isIncoming,
        }),
      })

      if (!res.ok) {
        throw new Error('やり取りの追加に失敗しました')
      }

      alert('やり取りに追加しました')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setAddingExchange(null)
    }
  }

  useEffect(() => {
    if (session?.accessToken) {
      fetchMatchedEmails()
    }
  }, [session?.accessToken])

  if (status === 'loading') {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Gmailと連携</h1>
          <p className="text-sm text-gray-500 mb-6">
            ログインが必要です。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">メール照合</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gmailのメールを顧客ドメインで照合し、やり取りに追加
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={daysBack}
            onChange={e => setDaysBack(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value={7}>過去7日間</option>
            <option value={14}>過去14日間</option>
            <option value={30}>過去30日間</option>
            <option value={60}>過去60日間</option>
            <option value={90}>過去90日間</option>
          </select>
          <button
            onClick={fetchMatchedEmails}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '取得中...' : '更新'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">📧</div>
            <div className="text-gray-500">メールを取得・照合中...</div>
            <div className="text-xs text-gray-400 mt-2">初回は少し時間がかかります</div>
          </div>
        </div>
      ) : matchData ? (
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Contact list */}
          <div className="w-1/3 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
              <div className="font-semibold text-gray-900">
                マッチした顧客 ({matchData.matchedContacts.length}件)
              </div>
              <div className="text-xs text-gray-500 mt-1">
                合計 {matchData.totalEmails} 通のメール
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {matchData.matchedContacts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  マッチする顧客がありません
                </div>
              ) : (
                matchData.matchedContacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-4 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      selectedContact?.id === contact.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {contact.name}
                        </div>
                        {contact.company && (
                          <div className="text-sm text-gray-500 truncate">
                            {contact.company}
                          </div>
                        )}
                        <div className="text-xs text-blue-600 mt-1">
                          @{contact.domain}
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-2">
                        <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          {contact.emails.length}通
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email detail */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            {selectedContact ? (
              <>
                <div className="p-4 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {selectedContact.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {selectedContact.company} • @{selectedContact.domain}
                      </div>
                    </div>
                    <Link
                      href={`/contacts/${selectedContact.id}`}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      顧客詳細を見る
                    </Link>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3">
                  {selectedContact.emails.map(email => (
                    <div
                      key={email.id}
                      className={`p-4 rounded-lg border ${
                        email.isIncoming
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg ${email.isIncoming ? 'text-blue-600' : 'text-green-600'}`}>
                            {email.isIncoming ? '📥' : '📤'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {email.isIncoming ? '受信' : '送信'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(email.date)}
                        </div>
                      </div>
                      <div className="font-medium text-gray-900 mb-1">
                        {email.subject}
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        {email.snippet}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="text-gray-500">
                          {email.isIncoming ? `From: ${email.fromEmail}` : `To: ${email.toEmail}`}
                        </div>
                        <button
                          onClick={() => addToExchange(selectedContact, email)}
                          disabled={addingExchange === email.id}
                          className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          {addingExchange === email.id ? '追加中...' : 'やり取りに追加'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                左のリストから顧客を選択してください
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Unmatched domains */}
      {matchData && matchData.unmatchedDomains.length > 0 && (
        <div className="mt-4 flex-shrink-0">
          <details className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              未登録ドメイン ({matchData.unmatchedDomains.length}件)
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {matchData.unmatchedDomains.map(domain => (
                <span
                  key={domain}
                  className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600"
                >
                  @{domain}
                </span>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return format(date, 'M/d (E) HH:mm', { locale: ja })
  } catch {
    return dateStr
  }
}
