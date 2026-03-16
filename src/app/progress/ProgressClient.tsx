'use client'

import Link from 'next/link'
import { getPhasesForService } from '@/lib/service-phases'

interface ContactInfo {
  id: string
  name: string
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  recommendedServices: string | null
  emailStatus: string
  followUpStatus: string
  salesPhase: string
}

interface ServicePhaseRecord {
  id: string
  contactId: string
  service: string
  phase: string
  updatedAt: string
  contact: ContactInfo
}

interface Props {
  servicePhases: ServicePhaseRecord[]
  allContacts: ContactInfo[]
  selectedService?: string
}

const SERVICES = [
  { name: '生成AI活用セミナー',     bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',     bar: 'bg-blue-500' },
  { name: 'AIパーソナルトレーニング',bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', bar: 'bg-purple-500' },
  { name: 'IT内製化支援',           bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  badge: 'bg-green-100 text-green-700',   bar: 'bg-green-500' },
  { name: 'マーケティング支援',     bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-600', badge: 'bg-orange-100 text-orange-600', bar: 'bg-orange-400' },
  { name: 'デバイス販売',           bg: 'bg-gray-50',   border: 'border-gray-200',  text: 'text-gray-700',   badge: 'bg-gray-200 text-gray-700',     bar: 'bg-gray-400' },
  { name: 'その他',                 bg: 'bg-pink-50',   border: 'border-pink-200',  text: 'text-pink-600',   badge: 'bg-pink-100 text-pink-600',     bar: 'bg-pink-400' },
]

function getSvc(name: string) {
  return SERVICES.find(s => s.name === name) ?? SERVICES[SERVICES.length - 1]
}

function getContactsForService(contacts: ContactInfo[], serviceName: string) {
  return contacts.filter(c =>
    c.recommendedServices?.split(',').map(s => s.trim()).includes(serviceName)
  )
}

const EMAIL_STATUS: Record<string, string> = {
  UNSENT: '未送信', DRAFTED: '下書き', APPROVED: '送信許可', SENT: '送信済',
}
const EMAIL_COLOR: Record<string, string> = {
  UNSENT: 'text-gray-400', DRAFTED: 'text-yellow-600', APPROVED: 'text-blue-600', SENT: 'text-green-600',
}

// ---- Overview ----
function OverviewView({ servicePhases, allContacts }: { servicePhases: ServicePhaseRecord[]; allContacts: ContactInfo[] }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">進捗管理</h1>
        <p className="text-sm text-gray-500 mt-1">各サービスの商談・案件進捗をフェーズ別に管理します</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {SERVICES.map(svc => {
          const contactsForSvc = getContactsForService(allContacts, svc.name)
          const total = contactsForSvc.length
          const phasedRecords = servicePhases.filter(sp => sp.service === svc.name)
          const withPhase = new Set(phasedRecords.map(sp => sp.contactId)).size
          const phases = getPhasesForService(svc.name)
          const phaseCounts = phases.map(p => ({
            label: p.label,
            count: phasedRecords.filter(sp => sp.phase === p.key).length,
          }))
          const notStarted = total - withPhase

          return (
            <Link
              key={svc.name}
              href={`/progress?service=${encodeURIComponent(svc.name)}`}
              className={`block rounded-xl border ${svc.border} ${svc.bg} p-5 hover:shadow-md transition-shadow group`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className={`text-sm font-bold ${svc.text}`}>{svc.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc.badge}`}>{total}名</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-gray-100">
                  {total > 0 && (
                    <div className={`h-full ${svc.bar} rounded-full`} style={{ width: `${Math.round((withPhase / total) * 100)}%` }} />
                  )}
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">{withPhase}/{total}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {notStarted > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                    未開始 {notStarted}
                  </span>
                )}
                {phaseCounts.filter(p => p.count > 0).map(p => (
                  <span key={p.label} className={`text-xs px-2 py-0.5 rounded-full ${svc.badge}`}>
                    {p.label} {p.count}
                  </span>
                ))}
              </div>
              <div className={`mt-3 text-xs font-medium ${svc.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                詳細を見る →
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ---- Service Detail (Kanban Board View) ----
function ServiceDetailView({
  serviceName,
  servicePhases,
  allContacts,
}: {
  serviceName: string
  servicePhases: ServicePhaseRecord[]
  allContacts: ContactInfo[]
}) {
  const svc = getSvc(serviceName)
  const phases = getPhasesForService(serviceName)

  const contactsForSvc = getContactsForService(allContacts, serviceName)
  const phasedRecords = servicePhases.filter(sp => sp.service === serviceName)

  const contactPhaseMap = new Map<string, string>()
  phasedRecords.forEach(sp => contactPhaseMap.set(sp.contactId, sp.phase))

  const contactsByPhase = new Map<string, ContactInfo[]>()
  phases.forEach(p => contactsByPhase.set(p.key, []))
  for (const sp of phasedRecords) {
    const arr = contactsByPhase.get(sp.phase)
    if (arr && !arr.find(c => c.id === sp.contact.id)) {
      arr.push(sp.contact)
    }
  }

  const notStarted = contactsForSvc.filter(c => !contactPhaseMap.has(c.id))

  // All columns including "未開始"
  const allColumns = [
    { key: 'NOT_STARTED', label: '未開始', contacts: notStarted },
    ...phases.map(p => ({
      key: p.key,
      label: p.label,
      contacts: contactsByPhase.get(p.key) ?? [],
    })),
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/progress" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">← 戻る</Link>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${svc.badge}`}>{serviceName}</span>
        <span className="text-sm text-gray-400">合計 {contactsForSvc.length}名</span>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {allColumns.map((col, colIndex) => (
            <div
              key={col.key}
              className={`w-52 flex-shrink-0 rounded-xl border-t-4 ${
                colIndex === 0 ? 'border-gray-300 bg-gray-50' : `${svc.border} ${svc.bg}`
              } p-3`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    colIndex === 0 ? 'bg-gray-400' : svc.bar
                  }`}>
                    {colIndex === 0 ? '−' : colIndex}
                  </span>
                  <h3 className={`text-xs font-semibold ${colIndex === 0 ? 'text-gray-600' : svc.text}`}>
                    {col.label}
                  </h3>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  colIndex === 0 ? 'bg-gray-200 text-gray-600' : svc.badge
                }`}>
                  {col.contacts.length}
                </span>
              </div>

              {/* Contact Cards */}
              <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                {col.contacts.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <p className="text-xs">なし</p>
                  </div>
                ) : (
                  col.contacts.map(contact => (
                    <Link key={contact.id} href={`/contacts/${contact.id}`}>
                      <div className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow border border-gray-100 cursor-pointer">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${
                            contact.emailStatus === 'SENT' ? 'bg-green-400' :
                            contact.emailStatus === 'APPROVED' ? 'bg-blue-400' :
                            contact.emailStatus === 'DRAFTED' ? 'bg-yellow-400' : 'bg-gray-300'
                          }`} title={EMAIL_STATUS[contact.emailStatus] || '未送信'} />
                        </div>
                        {contact.company && (
                          <p className="text-xs text-gray-500 truncate mb-1">{contact.company}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`${EMAIL_COLOR[contact.emailStatus] ?? 'text-gray-400'}`}>
                            📧 {EMAIL_STATUS[contact.emailStatus] ?? '未送信'}
                          </span>
                          {contact.followUpStatus !== 'NOT_SET' && (
                            <span className="text-orange-500">🔔</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="font-medium">ステータス:</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> 未送信</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> 下書き</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> 送信許可</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> 送信済</span>
          <span className="flex items-center gap-1">🔔 フォロー中</span>
        </div>
      </div>
    </div>
  )
}

export default function ProgressClient({ servicePhases, allContacts, selectedService }: Props) {
  return (
    <div className="p-6">
      {selectedService ? (
        <ServiceDetailView
          serviceName={selectedService}
          servicePhases={servicePhases}
          allContacts={allContacts}
        />
      ) : (
        <OverviewView servicePhases={servicePhases} allContacts={allContacts} />
      )}
    </div>
  )
}
