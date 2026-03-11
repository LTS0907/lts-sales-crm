export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    include: {
      members: { include: { contact: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">グループ</h1>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🏢</p>
          <p>グループがまだありません</p>
          <p className="text-sm mt-2">名刺を登録するとグループが自動作成されます</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => (
            <div key={group.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{group.name}</h2>
                  {group.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  group.type === 'COMPANY' ? 'bg-blue-50 text-blue-600' :
                  group.type === 'SECTOR' ? 'bg-purple-50 text-purple-600' :
                  'bg-gray-50 text-gray-600'
                }`}>
                  {group.type === 'COMPANY' ? '会社' : group.type === 'SECTOR' ? '業種' : 'カスタム'}
                </span>
              </div>
              <div className="space-y-1">
                {group.members.map(m => (
                  <Link
                    key={m.contactId}
                    href={`/contacts/${m.contactId}`}
                    className="flex items-center gap-2 py-1 hover:bg-gray-50 rounded-lg px-1"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700 font-medium overflow-hidden flex-shrink-0">
                      {m.contact.photoPath ? (
                        <img src={m.contact.photoPath} alt={m.contact.name} className="w-full h-full object-cover" />
                      ) : (
                        m.contact.name.charAt(0)
                      )}
                    </div>
                    <span className="text-sm text-gray-700">{m.contact.name}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">{group.members.length}名のメンバー</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
