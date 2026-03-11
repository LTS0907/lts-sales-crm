'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { parseRelationships } from '@/lib/relationship-parser'
import ServiceProgressStepper from '@/components/crm/ServiceProgressStepper'

const NOTE_CATS = [
  { value: 'GENERAL', label: '一般', color: 'bg-gray-50 text-gray-600' },
  { value: 'MEETING', label: '会議', color: 'bg-blue-50 text-blue-600' },
  { value: 'PREFERENCE', label: '好み', color: 'bg-pink-50 text-pink-600' },
  { value: 'BACKGROUND', label: '経歴', color: 'bg-green-50 text-green-600' },
]

const SALES_PHASES = [
  { value: 'LEAD', label: 'リード' },
  { value: 'APPOINTMENT', label: 'アポ調整' },
  { value: 'MEETING_SET', label: '商談設定' },
  { value: 'MEETING_DONE', label: '打ち合わせ完了' },
  { value: 'PROPOSING', label: '提案中' },
  { value: 'CONTRACTED', label: '受注' },
  { value: 'LOST', label: '失注' },
  { value: 'ON_HOLD', label: '保留' },
  { value: 'NURTURING', label: '育成中' },
  { value: 'INTERESTED', label: '関心あり' },
  { value: 'LONG_TERM', label: '長期育成' },
]

const EMAIL_STATUS = [
  { value: 'UNSENT', label: '未送信', color: 'bg-gray-100 text-gray-600' },
  { value: 'DRAFTED', label: '下書き済', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'APPROVED', label: '送信許可', color: 'bg-blue-100 text-blue-700' },
  { value: 'SENT', label: '送信済み', color: 'bg-green-100 text-green-700' },
]

const SERVICES = [
  { label: '生成AI活用セミナー',    short: 'AIセミナー',  activeBg: 'bg-blue-600',   activeText: 'text-white', inactiveBg: 'bg-blue-50',   inactiveText: 'text-blue-300',  badgeBg: 'bg-blue-100',  badgeText: 'text-blue-700'  },
  { label: 'AIパーソナルトレーニング', short: 'AI個別',    activeBg: 'bg-purple-600', activeText: 'text-white', inactiveBg: 'bg-purple-50', inactiveText: 'text-purple-300',badgeBg: 'bg-purple-100',badgeText: 'text-purple-700'},
  { label: 'IT内製化支援',           short: 'IT内製化',  activeBg: 'bg-green-600',  activeText: 'text-white', inactiveBg: 'bg-green-50',  inactiveText: 'text-green-300', badgeBg: 'bg-green-100', badgeText: 'text-green-700' },
  { label: 'マーケティング支援',     short: 'マーケ',    activeBg: 'bg-orange-500', activeText: 'text-white', inactiveBg: 'bg-orange-50', inactiveText: 'text-orange-300',badgeBg: 'bg-orange-100',badgeText: 'text-orange-700'},
  { label: 'デバイス販売',           short: 'デバイス',  activeBg: 'bg-gray-600',   activeText: 'text-white', inactiveBg: 'bg-gray-100',  inactiveText: 'text-gray-300',  badgeBg: 'bg-gray-100',  badgeText: 'text-gray-700'  },
  { label: 'その他',                 short: 'その他',    activeBg: 'bg-pink-500',   activeText: 'text-white', inactiveBg: 'bg-pink-50',   inactiveText: 'text-pink-300',  badgeBg: 'bg-pink-100',  badgeText: 'text-pink-700'  },
]

function NoteText({ text, contacts }: { text: string; contacts: { id: string; name: string }[] }) {
  return (
    <span>
      {parseRelationships(text, contacts).map((seg, i) =>
        seg.type === 'link'
          ? <Link key={i} href={`/contacts/${seg.contactId}`} className="text-blue-600 hover:underline font-medium">{seg.content}</Link>
          : <span key={i}>{seg.content}</span>
      )}
    </span>
  )
}

export default function ContactDetailClient({ contact, allContacts }: { contact: any; allContacts: { id: string; name: string }[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'notes'|'exchanges'|'crm'|'ai'>('notes')
  const [notes, setNotes] = useState(contact.notes)
  const [exchanges, setExchanges] = useState(contact.exchanges)
  const [photoPath, setPhotoPath] = useState(contact.photoPath)
  const [newNote, setNewNote] = useState(''); const [noteCat, setNoteCat] = useState('GENERAL')
  const [newExchange, setNewExchange] = useState(''); const [exchDir, setExchDir] = useState('THEY_DID_FOR_ME')
  const [salesPhase, setSalesPhase] = useState(contact.salesPhase)
  const [emailStatus, setEmailStatus] = useState(contact.emailStatus)
  const [emailSubject, setEmailSubject] = useState(contact.emailSubject || '')
  const [emailBody, setEmailBody] = useState(contact.emailBody || '')
  const [refineInstruction, setRefineInstruction] = useState('')
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [aiSummary, setAiSummary] = useState(contact.contactSummary)
  const [companySummary, setCompanySummary] = useState(contact.companySummary)
  const [selectedServices, setSelectedServices] = useState<string[]>(
    contact.recommendedServices ? contact.recommendedServices.split(',').map((s: string) => s.trim()).filter(Boolean) : []
  )
  const [serviceReason, setServiceReason] = useState(contact.serviceReason || '')
  const [loadingService, setLoadingService] = useState(false)
  const [loadingCompany, setLoadingCompany] = useState(false)
  const [cardImageOpen, setCardImageOpen] = useState(false)
  const [servicePhaseMap, setServicePhaseMap] = useState<Record<string, string>>(
    Object.fromEntries((contact.servicePhases || []).map((sp: any) => [sp.service, sp.phase]))
  )

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('photo', file)
    const res = await fetch(`/api/contacts/${contact.id}/photo`, { method: 'POST', body: fd })
    const data = await res.json(); setPhotoPath(data.photoPath)
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    const res = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newNote, category: noteCat, contactId: contact.id }) })
    const note = await res.json()
    setNotes((n: any) => [note, ...n]); setNewNote('')
  }

  const addExchange = async () => {
    if (!newExchange.trim()) return
    const res = await fetch('/api/exchanges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: newExchange, direction: exchDir, contactId: contact.id }) })
    const exchange = await res.json()
    setExchanges((ex: any) => [exchange, ...ex]); setNewExchange('')
  }

  const updateCRM = async (field: string, value: any) => {
    await fetch(`/api/contacts/${contact.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) })
  }

  const generateEmail = async () => {
    setLoadingEmail(true)
    try {
      const res = await fetch('/api/ai/generate-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: contact.id }) })
      const data = await res.json()
      if (data.subject) { setEmailSubject(data.subject); setEmailBody(data.body); setEmailStatus('DRAFTED') }
    } finally { setLoadingEmail(false) }
  }

  const refineEmail = async () => {
    if (!refineInstruction.trim()) return
    setLoadingEmail(true)
    try {
      const res = await fetch('/api/ai/refine-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: contact.id, subject: emailSubject, body: emailBody, instruction: refineInstruction }) })
      const data = await res.json()
      if (data.subject) { setEmailSubject(data.subject); setEmailBody(data.body) }
      setRefineInstruction('')
    } finally { setLoadingEmail(false) }
  }

  const saveEmail = async () => {
    await fetch(`/api/contacts/${contact.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailSubject, emailBody }) })
    alert('保存しました')
  }

  const approveEmail = async () => {
    await fetch(`/api/contacts/${contact.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailStatus: 'APPROVED' }) })
    setEmailStatus('APPROVED')
  }

  const markSent = async () => {
    await fetch(`/api/contacts/${contact.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailStatus: 'SENT', emailSentAt: new Date().toISOString() }) })
    setEmailStatus('SENT')
  }

  const toggleService = async (label: string) => {
    const next = selectedServices.includes(label)
      ? selectedServices.filter(s => s !== label)
      : [...selectedServices, label]
    setSelectedServices(next)
    await fetch(`/api/contacts/${contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendedServices: next.join(', ') }),
    })
  }

  const recommendServicesHandler = async () => {
    setLoadingService(true)
    try {
      const res = await fetch('/api/ai/recommend-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: contact.id }) })
      const data = await res.json()
      if (data.services) { setSelectedServices(data.services); setServiceReason(data.reason) }
    } finally { setLoadingService(false) }
  }

  const generateAISummary = async () => {
    setLoadingAI(true)
    try {
      const res = await fetch('/api/ai/contact-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: contact.id }) })
      const data = await res.json(); if (data.summary) setAiSummary(data.summary)
    } finally { setLoadingAI(false) }
  }

  const generateCompanySummary = async () => {
    setLoadingCompany(true)
    try {
      const res = await fetch('/api/ai/company-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: contact.id }) })
      const data = await res.json(); if (data.summary) setCompanySummary(data.summary)
    } finally { setLoadingCompany(false) }
  }

  const deleteContact = async () => {
    if (!confirm(`「${contact.name}」を削除しますか？`)) return
    await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' }); router.push('/contacts')
  }

  const statusInfo = EMAIL_STATUS.find(s => s.value === emailStatus) || EMAIL_STATUS[0]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-5 mb-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl overflow-hidden border-2 border-blue-200">
            {photoPath ? <img src={photoPath} className="w-full h-full object-cover" /> : contact.name.charAt(0)}
          </div>
          <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-50 text-sm">
            📷<input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
          </label>
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{contact.name}</h1>
              {contact.nameKana && <p className="text-xs text-gray-400">{contact.nameKana}</p>}
              {contact.title && <p className="text-sm text-gray-600">{contact.title}</p>}
              {contact.company && <p className="text-sm font-medium text-blue-600">{contact.department ? `${contact.department} / ` : ''}{contact.company}</p>}
            </div>
            <div className="flex gap-2">
              <Link href={`/contacts/${contact.id}/edit`} className="px-3 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">編集</Link>
              <button onClick={deleteContact} className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">削除</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {contact.phone && <a href={`tel:${contact.phone}`} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">📞 {contact.phone}</a>}
            {contact.email && <a href={`mailto:${contact.email}`} className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded-lg">✉️ {contact.email}</a>}
            {contact.lineId && <a href={`line://ti/p/${contact.lineId}`} className="text-xs px-2 py-1 bg-green-50 text-green-800 rounded-lg">💬 LINE</a>}
            {contact.gmailAlias && <a href={`https://mail.google.com/mail/?view=cm&to=${contact.gmailAlias}`} target="_blank" className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded-lg">📧 Gmail</a>}
            {contact.website && <a href={contact.website} target="_blank" className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg">🌐 Web</a>}
          </div>
          {selectedServices.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedServices.map(s => {
                const svc = SERVICES.find(sv => sv.label === s)
                return <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc ? `${svc.badgeBg} ${svc.badgeText}` : 'bg-gray-100 text-gray-600'}`}>{s}</span>
              })}
            </div>
          )}
        </div>
      </div>

      {/* Business Card Image */}
      {contact.cardImageUrl && (
        <div className="mb-5">
          <button
            onClick={() => setCardImageOpen(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 mb-2"
          >
            <span>🪪 名刺画像</span>
            <span className="text-xs text-gray-400">{cardImageOpen ? '▲ 閉じる' : '▼ 表示'}</span>
          </button>
          {cardImageOpen && (
            <div className="relative">
              <img
                src={contact.cardImageUrl}
                alt={`${contact.name}の名刺`}
                className="max-w-full rounded-xl border border-gray-200 shadow-sm"
                style={{ maxHeight: '300px', objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-5">
        <div className="flex gap-0">
          {[['notes','メモ・記録'],['exchanges','やりとり'],['crm','営業CRM'],['ai','AIまとめ']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes Tab */}
      {tab === 'notes' && (
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex gap-2 mb-3 flex-wrap">
              {NOTE_CATS.map(c => (
                <button key={c.value} onClick={() => setNoteCat(c.value)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${noteCat === c.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3} placeholder="メモを入力... (登録済みの人名でリンクになります)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <div className="flex justify-end mt-2">
              <button onClick={addNote} disabled={!newNote.trim()} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">追加</button>
            </div>
          </div>
          <div className="space-y-2">
            {notes.length === 0 ? <p className="text-center text-gray-400 py-8">メモがまだありません</p> : notes.map((note: any) => (
              <div key={note.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${NOTE_CATS.find(c => c.value === note.category)?.color || 'bg-gray-50 text-gray-600'}`}>
                    {NOTE_CATS.find(c => c.value === note.category)?.label || note.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleDateString('ja-JP')}</span>
                    <button onClick={async () => { await fetch(`/api/notes/${note.id}`, { method: 'DELETE' }); setNotes((n: any) => n.filter((x: any) => x.id !== note.id)) }} className="text-xs text-red-400 hover:text-red-600">削除</button>
                  </div>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap"><NoteText text={note.content} contacts={allContacts} /></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exchanges Tab */}
      {tab === 'exchanges' && (
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex gap-2 mb-3">
              {[['THEY_DID_FOR_ME','相手がしてくれたこと','bg-green-600'],['I_DID_FOR_THEM','自分がしたこと','bg-orange-600']].map(([val, label, bg]) => (
                <button key={val} onClick={() => setExchDir(val)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${exchDir === val ? `${bg} text-white border-transparent` : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
            <input type="text" value={newExchange} onChange={e => setNewExchange(e.target.value)} placeholder="内容を入力..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={e => e.key === 'Enter' && addExchange()} />
            <div className="flex justify-end mt-2"><button onClick={addExchange} disabled={!newExchange.trim()} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">追加</button></div>
          </div>
          <div className="space-y-4">
            {['THEY_DID_FOR_ME','I_DID_FOR_THEM'].map(dir => (
              <div key={dir}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dir === 'THEY_DID_FOR_ME' ? 'text-green-600' : 'text-orange-600'}`}>
                  {dir === 'THEY_DID_FOR_ME' ? '✅ 相手がしてくれたこと' : '🤝 自分がしたこと'}
                </h3>
                {exchanges.filter((e: any) => e.direction === dir).map((ex: any) => (
                  <div key={ex.id} className={`border rounded-lg p-3 mb-2 ${dir === 'THEY_DID_FOR_ME' ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                    <div className="flex justify-between items-start">
                      <p className="text-sm text-gray-700">{ex.description}</p>
                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        <span className="text-xs text-gray-400">{new Date(ex.createdAt).toLocaleDateString('ja-JP')}</span>
                        <button onClick={async () => { await fetch(`/api/exchanges/${ex.id}`, { method: 'DELETE' }); setExchanges((e: any) => e.filter((x: any) => x.id !== ex.id)) }} className="text-xs text-red-400 hover:text-red-600">削除</button>
                      </div>
                    </div>
                  </div>
                ))}
                {exchanges.filter((e: any) => e.direction === dir).length === 0 && <p className="text-xs text-gray-400 py-2">まだありません</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CRM Tab */}
      {tab === 'crm' && (
        <div className="space-y-5">

          {/* Service Progress */}
          {selectedServices.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 サービス別 進捗</h3>
              <div className="space-y-3">
                {selectedServices.map(service => (
                  <ServiceProgressStepper
                    key={service}
                    contactId={contact.id}
                    service={service}
                    currentPhase={servicePhaseMap[service] === 'NONE' ? null : (servicePhaseMap[service] || null)}
                    onPhaseChange={(svc, phase) => setServicePhaseMap(m => ({ ...m, [svc]: phase }))}
                  />
                ))}
              </div>
            </div>
          )}
          {selectedServices.length === 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-400">検討サービスを設定すると進捗トラッカーが表示されます</p>
              <p className="text-xs text-gray-300 mt-1">↓ 下の「検討サービス」でサービスを選択してください</p>
            </div>
          )}

          {/* Phase & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-3">営業フェーズ</h3>
              <select value={salesPhase} onChange={async e => { setSalesPhase(e.target.value); await updateCRM('salesPhase', e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SALES_PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-3">メールステータス</h3>
              <div className={`text-sm font-medium px-3 py-2 rounded-lg ${statusInfo.color}`}>{statusInfo.label}</div>
              <p className="text-xs text-gray-400 mt-1">タッチ回数: {contact.touchNumber}回</p>
            </div>
          </div>

          {/* Service Selection */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">検討サービス</h3>
                <p className="text-xs text-gray-400 mt-0.5">タップで検討中/非検討を切り替え</p>
              </div>
              <button onClick={recommendServicesHandler} disabled={loadingService}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap">
                {loadingService ? '🤖 分析中...' : '🤖 AIで自動判定'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SERVICES.map(svc => {
                const active = selectedServices.includes(svc.label)
                return (
                  <button
                    key={svc.label}
                    onClick={() => toggleService(svc.label)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      active
                        ? `${svc.activeBg} ${svc.activeText} border-transparent shadow-sm`
                        : `${svc.inactiveBg} ${svc.inactiveText} border-gray-100`
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-white opacity-80' : 'bg-current opacity-30'}`} />
                    <span className="text-left leading-tight">{svc.label}</span>
                    {active && <span className="ml-auto text-xs opacity-75">✓</span>}
                  </button>
                )
              })}
            </div>
            {selectedServices.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1.5">検討中 ({selectedServices.length}件)</p>
                <div className="flex flex-wrap gap-1">
                  {selectedServices.map(s => {
                    const svc = SERVICES.find(sv => sv.label === s)
                    return <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc ? `${svc.badgeBg} ${svc.badgeText}` : 'bg-gray-100 text-gray-600'}`}>{s}</span>
                  })}
                </div>
              </div>
            )}
            {serviceReason && (
              <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 font-medium mb-0.5">AI判定理由</p>
                <p className="text-xs text-gray-600">{serviceReason}</p>
              </div>
            )}
          </div>

          {/* Episode Memo */}
          {contact.episodeMemo && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-yellow-700 mb-2">出会い・コメント</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.episodeMemo}</p>
            </div>
          )}

          {/* Email Draft */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500">営業メール</h3>
              <button onClick={generateEmail} disabled={loadingEmail}
                className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loadingEmail ? '生成中...' : emailSubject ? '再生成' : 'AIでメール生成'}
              </button>
            </div>
            {emailSubject ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">件名</label>
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">本文</label>
                  <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>
                <div className="flex gap-2">
                  <input value={refineInstruction} onChange={e => setRefineInstruction(e.target.value)} placeholder="修正指示（例: もっと簡潔に）"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={refineEmail} disabled={!refineInstruction.trim() || loadingEmail}
                    className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50">AI修正</button>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEmail} className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50">保存</button>
                  {emailStatus === 'DRAFTED' && <button onClick={approveEmail} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">送信許可</button>}
                  {emailStatus === 'APPROVED' && <button onClick={markSent} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">送信済みにする</button>}
                  {emailStatus === 'APPROVED' && contact.email && (
                    <a href={`mailto:${contact.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                      className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600">メーラーで開く</a>
                  )}
                </div>
              </div>
            ) : <p className="text-xs text-gray-400">「AIでメール生成」を押すと出会いのメモを元にメールを自動作成します</p>}
          </div>
        </div>
      )}

      {/* AI Summary Tab */}
      {tab === 'ai' && (
        <div className="space-y-4">
          {contact.company && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">🏢 会社AIまとめ</h3>
                <button onClick={generateCompanySummary} disabled={loadingCompany} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                  {loadingCompany ? '生成中...' : companySummary ? '再生成' : '生成する'}
                </button>
              </div>
              {companySummary ? <p className="text-sm text-gray-600 whitespace-pre-wrap">{companySummary}</p> : <p className="text-xs text-gray-400">「生成する」を押してください</p>}
            </div>
          )}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">🤖 人物AIまとめ</h3>
              <button onClick={generateAISummary} disabled={loadingAI || notes.length === 0}
                className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {loadingAI ? '生成中...' : aiSummary ? '再生成' : 'まとめを生成'}
              </button>
            </div>
            {notes.length === 0 ? <p className="text-sm text-gray-400">メモを追加してから生成できます</p>
              : aiSummary ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiSummary}</p>
              : <p className="text-sm text-gray-400">「まとめを生成」を押してAIによる人物分析を行います</p>}
          </div>
        </div>
      )}
    </div>
  )
}
