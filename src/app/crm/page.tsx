export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function CRMDashboard() {
  const [total, drafted, approved, sent, dueSoon] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { emailStatus: 'DRAFTED' } }),
    prisma.contact.count({ where: { emailStatus: 'APPROVED' } }),
    prisma.contact.count({ where: { emailStatus: 'SENT' } }),
    prisma.contact.count({ where: { followUpDate: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, followUpStatus: { in: ['NOT_SET', 'DRAFTED'] } } }),
  ])

  const recentDrafts = await prisma.contact.findMany({
    where: { emailStatus: { in: ['DRAFTED', 'APPROVED'] } },
    orderBy: { updatedAt: 'desc' }, take: 5,
  })

  const metrics = [
    { label: '総コンタクト', value: total, color: 'bg-blue-50 text-blue-700', icon: '👤' },
    { label: '下書き待ち', value: drafted, color: 'bg-yellow-50 text-yellow-700', icon: '📝', href: '/crm/emails' },
    { label: '送信許可済', value: approved, color: 'bg-green-50 text-green-700', icon: '✅', href: '/crm/emails' },
    { label: '送信済み', value: sent, color: 'bg-gray-50 text-gray-600', icon: '📨' },
    { label: 'フォロー期限近', value: dueSoon, color: 'bg-red-50 text-red-700', icon: '🔔', href: '/crm/followups' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">CRMダッシュボード</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {metrics.map(m => {
          const content = (
            <>
              <p className="text-2xl mb-1">{m.icon}</p>
              <p className="text-2xl font-bold">{m.value}</p>
              <p className="text-xs font-medium">{m.label}</p>
            </>
          )
          return m.href ? (
            <Link key={m.label} href={m.href} className={`${m.color} rounded-xl p-4 cursor-pointer hover:opacity-80 block`}>
              {content}
            </Link>
          ) : (
            <div key={m.label} className={`${m.color} rounded-xl p-4`}>
              {content}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">📧 メール承認待ち</h2>
            <Link href="/crm/emails" className="text-xs text-blue-600 hover:underline">すべて見る</Link>
          </div>
          {recentDrafts.length === 0 ? <p className="text-xs text-gray-400">承認待ちのメールはありません</p> : (
            <div className="space-y-2">
              {recentDrafts.map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`}>
                  <div className="flex items-center gap-2 py-2 hover:bg-gray-50 rounded-lg px-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700 font-bold flex-shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      {c.emailSubject && <p className="text-xs text-gray-500 truncate">{c.emailSubject}</p>}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.emailStatus === 'APPROVED' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {c.emailStatus === 'APPROVED' ? '送信許可' : '下書き'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">🔄 パイプライン概要</h2>
            <Link href="/crm/pipeline" className="text-xs text-blue-600 hover:underline">詳細を見る</Link>
          </div>
          <PipelineSummary />
        </div>
      </div>
    </div>
  )
}

async function PipelineSummary() {
  const phases = await prisma.contact.groupBy({ by: ['salesPhase'], _count: true })
  const PHASE_LABELS: Record<string, string> = {
    LEAD: 'リード', APPOINTMENT: 'アポ調整', MEETING_SET: '商談設定',
    MEETING_DONE: 'アポ調整完了', PROPOSING: '提案中', CONTRACTED: '入金待ち', PAID: '入金完了',
    LOST: '失注', ON_HOLD: '保留', NURTURING: '育成中', INTERESTED: '関心あり', LONG_TERM: '長期育成',
  }
  return (
    <div className="space-y-1.5">
      {phases.sort((a, b) => b._count - a._count).slice(0, 6).map(p => (
        <div key={p.salesPhase} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-24 flex-shrink-0">{PHASE_LABELS[p.salesPhase] || p.salesPhase}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, p._count * 10)}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-700 w-6 text-right">{p._count}</span>
        </div>
      ))}
    </div>
  )
}
