import { prisma } from '@/lib/prisma'
import Link from 'next/link'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  UNSENT:  { label: '未送信', color: 'bg-gray-100 text-gray-600' },
  DRAFTED: { label: '下書き', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED:{ label: '送信許可', color: 'bg-blue-100 text-blue-700' },
  SENT:    { label: '送信済', color: 'bg-green-100 text-green-700' },
}

const SERVICE_COLORS: Record<string, string> = {
  '生成AI活用セミナー':     'bg-blue-100 text-blue-700',
  'AIパーソナルトレーニング':'bg-purple-100 text-purple-700',
  'IT内製化支援':           'bg-green-100 text-green-700',
  'マーケティング支援':     'bg-orange-100 text-orange-700',
  'デバイス販売':           'bg-gray-100 text-gray-700',
  'その他':                 'bg-pink-100 text-pink-700',
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams

  const contacts = await prisma.contact.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { company: { contains: q } }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { notes: true } } },
  })

  const byCompany: Record<string, typeof contacts> = {}
  const noCompany: typeof contacts = []
  for (const c of contacts) {
    if (c.company) {
      if (!byCompany[c.company]) byCompany[c.company] = []
      byCompany[c.company].push(c)
    } else {
      noCompany.push(c)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">名刺一覧</h1>
        <Link href="/contacts/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 名刺を追加</Link>
      </div>

      <form className="mb-5">
        <div className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="名前・会社名で検索..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">検索</button>
        </div>
      </form>

      {contacts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📇</p>
          <p>名刺がまだ登録されていません</p>
          <Link href="/contacts/new" className="text-blue-500 text-sm mt-2 block hover:underline">最初の名刺を追加 →</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCompany).map(([company, members]) => (
            <div key={company}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                🏢 {company} <span className="bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500 font-normal">{members.length}名</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {members.map(c => <ContactCard key={c.id} contact={c} />)}
              </div>
            </div>
          ))}
          {noCompany.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">その他</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {noCompany.map(c => <ContactCard key={c.id} contact={c} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ContactCard({ contact }: { contact: any }) {
  const status = STATUS_LABEL[contact.emailStatus] || STATUS_LABEL.UNSENT
  return (
    <Link href={`/contacts/${contact.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold flex-shrink-0 overflow-hidden">
            {contact.photoPath ? <img src={contact.photoPath} className="w-full h-full object-cover" /> : contact.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{contact.name}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>{status.label}</span>
            </div>
            {contact.title && <p className="text-xs text-gray-500 truncate">{contact.title}</p>}
            {contact.company && <p className="text-xs text-blue-600 truncate">{contact.company}</p>}
          </div>
        </div>
        {contact.recommendedServices && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.recommendedServices.split(',').map((s: string) => {
              const label = s.trim()
              if (!label) return null
              return (
                <span key={label} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SERVICE_COLORS[label] || 'bg-gray-100 text-gray-600'}`}>
                  {label}
                </span>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {contact._count.notes > 0 && <span>📝 {contact._count.notes}件</span>}
          {contact.salesPhase && contact.salesPhase !== 'LEAD' && <span>🔄 {contact.salesPhase}</span>}
          {contact.touchNumber > 0 && <span>📨 {contact.touchNumber}回</span>}
        </div>
      </div>
    </Link>
  )
}
