export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getPhasesForService } from '@/lib/service-phases'

const SERVICES = [
  { name: '生成AI活用セミナー', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
  { name: 'AIパーソナルトレーニング', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', bar: 'bg-purple-500' },
  { name: 'IT内製化支援', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  { name: 'マーケティング支援', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-600', bar: 'bg-orange-400' },
  { name: 'デバイス販売', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-200 text-gray-700', bar: 'bg-gray-400' },
  { name: 'その他', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-600', badge: 'bg-pink-100 text-pink-600', bar: 'bg-pink-400' },
]

// アプローチが必要な日数のしきい値
const ALERT_DAYS = 14

function getContactsForService(contacts: any[], serviceName: string) {
  return contacts.filter(c =>
    c.recommendedServices?.split(',').map((s: string) => s.trim()).includes(serviceName)
  )
}

function getDaysSince(date: Date | null): number {
  if (!date) return 999
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default async function Dashboard() {
  const [contacts, servicePhases] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        company: true,
        title: true,
        email: true,
        recommendedServices: true,
        emailStatus: true,
        emailSentAt: true,
        followUpStatus: true,
        followUpDate: true,
        salesPhase: true,
        updatedAt: true,
        touchNumber: true,
      },
    }),
    prisma.servicePhase.findMany({
      include: { Contact: { select: { id: true, name: true, company: true } } },
    }),
  ])

  // アラート対象：フェーズ最終更新から14日以上経過 & フェーズが終了していない
  const alertContacts = contacts.filter(c => {
    // 終了フェーズはアラート対象外
    if (c.salesPhase === 'CONTRACTED' || c.salesPhase === 'PAID' || c.salesPhase === 'LOST' || c.salesPhase === 'COMPLETED') {
      return false
    }
    // フェーズ変更日から経過日数を計算（未設定時はupdatedAtで代用）
    const daysSince = getDaysSince(c.updatedAt)
    return daysSince >= ALERT_DAYS
  }).sort((a, b) => {
    const daysA = getDaysSince(a.updatedAt)
    const daysB = getDaysSince(b.updatedAt)
    return daysB - daysA // 古い順
  })

  return (
    <div className="p-6">
      {/* アラートセクション（常に表示） */}
      <div className="mb-8">
          <h2 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
            🔔 アクション必要
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* アプローチ期限アラート */}
            {alertContacts.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                  ⏰ {ALERT_DAYS}日以上アプローチなし
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">{alertContacts.length}名</span>
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {alertContacts.slice(0, 10).map(c => {
                    const days = getDaysSince(c.updatedAt)
                    return (
                      <Link key={c.id} href={`/contacts/${c.id}`}>
                        <div className="bg-white rounded-lg p-3 hover:shadow-md transition-shadow border border-red-100">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                              {c.company && <p className="text-xs text-gray-500 truncate">{c.company}</p>}
                            </div>
                            <span className="text-xs font-bold text-red-600 whitespace-nowrap ml-2">
                              {days}日前
                            </span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                  {alertContacts.length > 10 && (
                    <p className="text-xs text-red-500 text-center pt-2">他 {alertContacts.length - 10}名...</p>
                  )}
                </div>
              </div>
            )}

          </div>

          {alertContacts.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-sm text-green-700">全員14日以内にアプローチ済みです</p>
            </div>
          )}
      </div>

      {/* 進捗管理セクション */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">📊 サービス別進捗</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SERVICES.map(svc => {
            const contactsForSvc = getContactsForService(contacts, svc.name)
            const total = contactsForSvc.length
            const phasedRecords = servicePhases.filter(sp => sp.service === svc.name)
            const withPhase = new Set(phasedRecords.map(sp => sp.contactId)).size
            const phases = getPhasesForService(svc.name)
            const phaseCounts = phases.map(p => ({
              label: p.label,
              count: phasedRecords.filter(sp => sp.phase === p.key).length,
            }))
            const notStarted = total - withPhase

            // このサービスでアラート対象の人数
            const alertCount = contactsForSvc.filter(c => {
              if (c.salesPhase === 'CONTRACTED' || c.salesPhase === 'PAID' || c.salesPhase === 'LOST') return false
              const days = getDaysSince(c.updatedAt)
              return days >= ALERT_DAYS
            }).length

            return (
              <Link
                key={svc.name}
                href={`/progress?service=${encodeURIComponent(svc.name)}`}
                className={`block rounded-xl border ${svc.border} ${svc.bg} p-5 hover:shadow-md transition-shadow group relative`}
              >
                {alertCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {alertCount}
                  </span>
                )}
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

      {/* クイックリンク */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/contacts" className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow text-center">
          <p className="text-2xl mb-1">👤</p>
          <p className="text-sm font-medium text-gray-700">名刺一覧</p>
        </Link>
        <Link href="/crm/emails" className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow text-center">
          <p className="text-2xl mb-1">📧</p>
          <p className="text-sm font-medium text-gray-700">メール管理</p>
        </Link>
        <Link href="/crm/pipeline" className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow text-center">
          <p className="text-2xl mb-1">📈</p>
          <p className="text-sm font-medium text-gray-700">パイプライン</p>
        </Link>
        <Link href="/calendar" className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow text-center">
          <p className="text-2xl mb-1">📅</p>
          <p className="text-sm font-medium text-gray-700">カレンダー</p>
        </Link>
      </div>
    </div>
  )
}
