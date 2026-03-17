export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'

const PHASES = [
  { value: 'LEAD', label: 'リード', color: 'border-gray-300' },
  { value: 'APPOINTMENT', label: 'アポ調整', color: 'border-blue-300' },
  { value: 'MEETING_DONE', label: '打ち合わせ完了', color: 'border-purple-300' },
  { value: 'PROPOSING', label: '提案中', color: 'border-yellow-300' },
  { value: 'CONTRACTED', label: '受注', color: 'border-green-300' },
  { value: 'NURTURING', label: '育成中', color: 'border-orange-300' },
]

const STATUS_DOT: Record<string, string> = {
  UNSENT: 'bg-gray-300', DRAFTED: 'bg-yellow-400', APPROVED: 'bg-blue-400', SENT: 'bg-green-400',
}

export default async function PipelinePage() {
  const contacts = await prisma.contact.findMany({ orderBy: { updatedAt: 'desc' } })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">パイプライン</h1>
      {/* PC: 横スクロール、スマホ: 縦積み */}
      <div className="block md:overflow-x-auto">
        <div className="flex flex-col gap-4 md:flex-row md:min-w-max pb-4">
          {PHASES.map(phase => {
            const phaseContacts = contacts.filter(c => c.salesPhase === phase.value)
            return (
              <div key={phase.value} className={`w-full md:w-56 md:flex-shrink-0 bg-gray-50 rounded-xl border-t-4 ${phase.color} p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-700">{phase.label}</h2>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{phaseContacts.length}</span>
                </div>
                <div className="space-y-2">
                  {phaseContacts.map(c => (
                    <Link key={c.id} href={`/contacts/${c.id}`}>
                      <div className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${STATUS_DOT[c.emailStatus] || 'bg-gray-300'}`} title={c.emailStatus} />
                        </div>
                        {c.company && <p className="text-xs text-gray-500 truncate">{c.company}</p>}
                        {c.touchNumber > 0 && <p className="text-xs text-blue-500 mt-1">📨 {c.touchNumber}回</p>}
                      </div>
                    </Link>
                  ))}
                  {phaseContacts.length === 0 && <p className="text-xs text-gray-400 text-center py-3">なし</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
