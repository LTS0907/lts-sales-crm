'use client'

import Link from 'next/link'
import { getPhasesForService } from '@/lib/service-phases'

// ---- Types ----

interface ContactInfo {
  id: string
  name: string
  company: string | null
  title: string | null
  recommendedServices: string | null
}

interface ServicePhaseRecord {
  id: string
  contactId: string
  service: string
  phase: string
  updatedAt: Date
  contact: ContactInfo
}

interface Props {
  servicePhases: ServicePhaseRecord[]
  allContacts: ContactInfo[]
  selectedService?: string
}

// ---- Service config ----

const SERVICES = [
  {
    name: '生成AI活用セミナー',
    color: 'blue',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-600',
    barFill: 'bg-blue-500',
  },
  {
    name: 'AIパーソナルトレーニング',
    color: 'purple',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
    dot: 'bg-purple-600',
    barFill: 'bg-purple-500',
  },
  {
    name: 'IT内製化支援',
    color: 'green',
    bg: 'bg-green-50',
    border: 'border-green-100',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-600',
    barFill: 'bg-green-500',
  },
  {
    name: 'マーケティング支援',
    color: 'orange',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    text: 'text-orange-600',
    badge: 'bg-orange-100 text-orange-600',
    dot: 'bg-orange-500',
    barFill: 'bg-orange-400',
  },
  {
    name: 'デバイス販売',
    color: 'gray',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-700',
    badge: 'bg-gray-200 text-gray-700',
    dot: 'bg-gray-500',
    barFill: 'bg-gray-400',
  },
  {
    name: 'その他',
    color: 'pink',
    bg: 'bg-pink-50',
    border: 'border-pink-100',
    text: 'text-pink-600',
    badge: 'bg-pink-100 text-pink-600',
    dot: 'bg-pink-500',
    barFill: 'bg-pink-400',
  },
]

function getServiceConfig(name: string) {
  return SERVICES.find(s => s.name === name) ?? SERVICES[SERVICES.length - 1]
}

function getContactsForService(contacts: ContactInfo[], serviceName: string): ContactInfo[] {
  return contacts.filter(c =>
    c.recommendedServices
      ?.split(',')
      .map(s => s.trim())
      .includes(serviceName)
  )
}

// ---- Overview ----

function OverviewView({
  servicePhases,
  allContacts,
}: {
  servicePhases: ServicePhaseRecord[]
  allContacts: ContactInfo[]
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">進捗管理</h1>
        <p className="text-sm text-gray-500 mt-1">各サービスの商談・案件進捗をフェーズ別に管理します</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {SERVICES.map(svc => {
          const contactsWithService = getContactsForService(allContacts, svc.name)
          const totalContacts = contactsWithService.length
          const phasesForService = getPhasesForService(svc.name)

          // Contacts that have a phase set for this service
          const phasedRecords = servicePhases.filter(sp => sp.service === svc.name)
          const contactsWithPhase = new Set(phasedRecords.map(sp => sp.contactId)).size

          // Count per phase
          const phaseCounts = phasesForService.map(phase => ({
            label: phase.label,
            key: phase.key,
            count: phasedRecords.filter(sp => sp.phase === phase.key).length,
          }))

          const notStarted = totalContacts - contactsWithPhase

          return (
            <Link
              key={svc.name}
              href={`/progress?service=${encodeURIComponent(svc.name)}`}
              className={`block rounded-xl border ${svc.border} ${svc.bg} p-5 hover:shadow-md transition-shadow group`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className={`text-sm font-bold ${svc.text}`}>{svc.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc.badge}`}>
                  {totalContacts}名
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-gray-100">
                  {totalContacts > 0 ? (
                    <div
                      className={`h-full ${svc.barFill} rounded-full transition-all`}
                      style={{ width: `${Math.round((contactsWithPhase / totalContacts) * 100)}%` }}
                    />
                  ) : null}
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {contactsWithPhase}/{totalContacts}
                </span>
              </div>

              {/* Phase breakdown */}
              <div className="flex flex-wrap gap-1.5">
                {notStarted > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                    未開始 {notStarted}
                  </span>
                )}
                {phaseCounts
                  .filter(p => p.count > 0)
                  .map(p => (
                    <span
                      key={p.key}
                      className={`text-xs px-2 py-0.5 rounded-full ${svc.badge}`}
                    >
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

// ---- Service Detail ----

function ServiceDetailView({
  serviceName,
  servicePhases,
  allContacts,
}: {
  serviceName: string
  servicePhases: ServicePhaseRecord[]
  allContacts: ContactInfo[]
}) {
  const svc = getServiceConfig(serviceName)
  const phases = getPhasesForService(serviceName)

  const contactsWithService = getContactsForService(allContacts, serviceName)
  const phasedRecords = servicePhases.filter(sp => sp.service === serviceName)

  // Build a map: contactId → phase key
  const contactPhaseMap = new Map<string, string>()
  phasedRecords.forEach(sp => contactPhaseMap.set(sp.contactId, sp.phase))

  // "未開始": in recommendedServices but no phase record
  const notStartedContacts = contactsWithService.filter(c => !contactPhaseMap.has(c.id))

  // Group contacts by phase key
  const contactsByPhase = new Map<string, ContactInfo[]>()
  phases.forEach(p => contactsByPhase.set(p.key, []))

  phasedRecords.forEach(sp => {
    const existing = contactsByPhase.get(sp.phase) ?? []
    // Avoid duplicates (should not happen due to @@unique but be safe)
    if (!existing.find(c => c.id === sp.contact.id)) {
      existing.push(sp.contact)
      contactsByPhase.set(sp.phase, existing)
    }
  })

  const columns = [
    { key: '__not_started__', label: '未開始', contacts: notStartedContacts, phaseIndex: null },
    ...phases.map((p, i) => ({
      key: p.key,
      label: p.label,
      contacts: contactsByPhase.get(p.key) ?? [],
      phaseIndex: i + 1,
    })),
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-shrink-0">
        <Link
          href="/progress"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← 戻る
        </Link>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${svc.badge}`}>
          {serviceName}
        </span>
        <span className="text-sm text-gray-400">
          合計 {contactsWithService.length}名
        </span>
      </div>

      {/* Columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
        {columns.map(col => (
          <div
            key={col.key}
            className="flex-shrink-0 w-52 flex flex-col bg-gray-50 rounded-xl border border-gray-200"
          >
            {/* Column header */}
            <div className="p-3 border-b border-gray-200 flex items-center gap-2">
              {col.phaseIndex !== null ? (
                <span
                  className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white ${svc.dot} flex-shrink-0`}
                >
                  {col.phaseIndex}
                </span>
              ) : (
                <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center bg-gray-300 text-white flex-shrink-0">
                  —
                </span>
              )}
              <span className="text-xs font-semibold text-gray-700 leading-tight">{col.label}</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 font-medium flex-shrink-0">
                {col.contacts.length}
              </span>
            </div>

            {/* Contact cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {col.contacts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">なし</p>
              ) : (
                col.contacts.map(contact => (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.id}`}
                    className="block bg-white rounded-lg border border-gray-200 p-2.5 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <p className="text-xs font-semibold text-gray-900 truncate">{contact.name}</p>
                    {contact.company && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{contact.company}</p>
                    )}
                    {contact.title && (
                      <p className="text-xs text-gray-400 truncate">{contact.title}</p>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Main export ----

export default function ProgressClient({ servicePhases, allContacts, selectedService }: Props) {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 overflow-auto">
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
