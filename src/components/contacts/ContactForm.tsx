'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import GroupPermissionDialog from './GroupPermissionDialog'

const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400 bg-white text-sm"

export default function ContactForm({ initialData, mode }: {
  initialData?: any
  mode: 'create' | 'edit'
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<'idle'|'success'|'error'>('idle')
  const [scanError, setScanError] = useState('')
  const [groupSuggestion, setGroupSuggestion] = useState<any>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: initialData?.name || '',
    nameKana: initialData?.nameKana || '',
    company: initialData?.company || '',
    department: initialData?.department || '',
    title: initialData?.title || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    lineId: initialData?.lineId || '',
    gmailAlias: initialData?.gmailAlias || '',
    website: initialData?.website || '',
    address: initialData?.address || '',
    connectionType: initialData?.connectionType || '',
    episodeMemo: initialData?.episodeMemo || '',
    owner: initialData?.owner || 'KAZUI',
  })

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setScanPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    setScanning(true); setScanStatus('idle'); setScanError('')
    try {
      const fd = new FormData(); fd.append('image', file)
      const res = await fetch('/api/ai/scan-card', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setScanStatus('error'); setScanError(data.error || 'エラーが発生しました'); return }
      const filled = Object.values(data).some(v => typeof v === 'string' && v !== '')
      if (!filled) { setScanStatus('error'); setScanError('読み取れませんでした。画像を確認してください'); return }
      setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '')) }))
      setScanStatus('success')
    } catch { setScanStatus('error'); setScanError('通信エラーが発生しました') }
    finally { setScanning(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const url = mode === 'create' ? '/api/contacts' : `/api/contacts/${initialData?.id}`
      const res = await fetch(url, { method: mode === 'create' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      const contactId = mode === 'create' ? data.contact.id : initialData?.id
      if (data.groupSuggestion) { setPendingId(contactId); setGroupSuggestion(data.groupSuggestion) }
      else router.push(`/contacts/${contactId}`)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleGroupAccept = async () => {
    if (!groupSuggestion || !pendingId) return
    if (groupSuggestion.groupId) {
      await fetch(`/api/groups/${groupSuggestion.groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: pendingId, consentGiven: true }) })
    } else {
      await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: groupSuggestion.groupName, type: 'COMPANY', contactIds: [pendingId] }) })
    }
    setGroupSuggestion(null); router.push(`/contacts/${pendingId}`)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* OCR Scan */}
        <div className="border-2 border-dashed border-blue-200 rounded-xl p-4 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">📷 名刺をスキャン</p>
              <p className="text-xs text-blue-500 mt-0.5">写真を選択するとAIが自動入力します</p>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={scanning}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {scanning ? '読み取り中...' : '写真を選択'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScan} />
          </div>
          {scanning && <p className="text-xs text-blue-600 mt-2 animate-pulse">AIが名刺を読み取っています...</p>}
          {scanPreview && !scanning && (
            <div className="mt-2 flex items-start gap-3">
              <img src={scanPreview} className="w-20 h-14 object-cover rounded-lg border border-blue-200 flex-shrink-0" />
              {scanStatus === 'success' && <p className="text-xs text-green-600 font-medium mt-1">✅ 読み取り完了。内容を確認してください。</p>}
              {scanStatus === 'error' && <div className="mt-1"><p className="text-xs text-red-600 font-medium">❌ 読み取り失敗</p><p className="text-xs text-red-500">{scanError}</p></div>}
            </div>
          )}
        </div>

        {/* 基本情報 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">基本情報</h3>
          <div className="grid grid-cols-2 gap-3">
            {[['氏名*','name','山田 太郎','text',true],['フリガナ','nameKana','ヤマダ タロウ','text',false],
              ['会社名','company','株式会社〇〇','text',false],['部署','department','営業部','text',false],
              ['役職','title','部長','text',false]].map(([label, key, ph, type, req]) => (
              <div key={key as string}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label as string}</label>
                <input type={type as string} required={!!req} value={(form as any)[key as string]}
                  onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))}
                  className={INPUT} placeholder={ph as string} />
              </div>
            ))}
          </div>
        </div>

        {/* 連絡先 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">連絡先</h3>
          <div className="grid grid-cols-2 gap-3">
            {[['メール','email','text'],['電話','phone','tel'],['LINE ID','lineId','text'],['Gmail','gmailAlias','email'],['ウェブサイト','website','url'],['住所','address','text']].map(([label, key, type]) => (
              <div key={key as string}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label as string}</label>
                <input type={type as string} value={(form as any)[key as string]}
                  onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))}
                  className={INPUT} />
              </div>
            ))}
          </div>
        </div>

        {/* 担当者 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">担当者</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { value: 'KAZUI',     label: '👤 龍竹（かずい）', activeClass: 'bg-blue-600 text-white border-blue-600' },
              { value: 'KABASHIMA', label: '🌙 樺嶋',          activeClass: 'bg-purple-600 text-white border-purple-600' },
              { value: 'SHARED',    label: '🤝 共同',          activeClass: 'bg-green-600 text-white border-green-600' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, owner: opt.value }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  form.owner === opt.value
                    ? opt.activeClass
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* つながり */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">つながり</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { value: 'PERSONAL',   label: '👤 個人として' },
              { value: 'BUSINESS',   label: '🏢 会社として' },
              { value: 'NETWORKING', label: '🤝 勉強会・セミナー' },
              { value: 'ONLINE',     label: '💻 オンライン' },
              { value: 'OTHER',      label: '📌 その他' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, connectionType: f.connectionType === opt.value ? '' : opt.value }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  form.connectionType === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 出会いメモ */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">出会い・コメント</h3>
          <textarea value={form.episodeMemo} onChange={e => setForm(f => ({ ...f, episodeMemo: e.target.value }))}
            placeholder="どこで出会ったか、印象など..." rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="flex-1 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? '保存中...' : mode === 'create' ? '名刺を登録' : '更新する'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">キャンセル</button>
        </div>
      </form>
      {groupSuggestion && <GroupPermissionDialog suggestion={groupSuggestion} onAccept={handleGroupAccept} onDecline={() => { setGroupSuggestion(null); router.push(`/contacts/${pendingId}`) }} />}
    </>
  )
}
