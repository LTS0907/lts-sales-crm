import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function FollowupsPage() {
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [overdue, upcoming, all] = await Promise.all([
    prisma.contact.findMany({ where: { followUpDate: { lt: now }, followUpStatus: { in: ['NOT_SET', 'DRAFTED'] } }, orderBy: { followUpDate: 'asc' } }),
    prisma.contact.findMany({ where: { followUpDate: { gte: now, lte: nextWeek }, followUpStatus: { in: ['NOT_SET', 'DRAFTED'] } }, orderBy: { followUpDate: 'asc' } }),
    prisma.contact.findMany({ where: { touchNumber: { gt: 0 } }, orderBy: { updatedAt: 'desc' }, take: 20 }),
  ])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">フォローアップ</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Section title="⚠️ 期限超過" contacts={overdue} badgeColor="bg-red-100 text-red-700" emptyText="期限超過なし" />
        <Section title="🔔 今週中" contacts={upcoming} badgeColor="bg-yellow-100 text-yellow-700" emptyText="今週の予定なし" />
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">📊 フォロー履歴（最近20件）</h2>
          {all.length === 0 ? <p className="text-xs text-gray-400">フォロー履歴なし</p> : (
            <div className="space-y-2">
              {all.map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`}>
                  <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700 font-bold flex-shrink-0">{c.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{c.name}</p>
                      {c.company && <p className="text-xs text-gray-500 truncate">{c.company}</p>}
                    </div>
                    <span className="text-xs text-blue-600">{c.touchNumber}回</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, contacts, badgeColor, emptyText }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="font-semibold text-gray-900 mb-3 text-sm">{title}</h2>
      {contacts.length === 0 ? <p className="text-xs text-gray-400">{emptyText}</p> : (
        <div className="space-y-2">
          {contacts.map((c: any) => (
            <Link key={c.id} href={`/contacts/${c.id}`}>
              <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  {c.company && <p className="text-xs text-gray-500 truncate">{c.company}</p>}
                  {c.followUpDate && <p className="text-xs text-red-500">{new Date(c.followUpDate).toLocaleDateString('ja-JP')}</p>}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeColor}`}>{c.touchNumber}回</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
