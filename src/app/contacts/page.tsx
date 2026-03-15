export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import ContactsClient from '@/components/contacts/ContactsClient'

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams

  const contacts = await prisma.contact.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { company: { contains: q } }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { notes: true } } },
  })

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">名刺一覧</h1>
        <Link href="/contacts/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + 名刺を追加
        </Link>
      </div>

      <form className="mb-5">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="名前・会社名で検索..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            検索
          </button>
        </div>
      </form>

      {contacts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📇</p>
          <p>名刺がまだ登録されていません</p>
          <Link href="/contacts/new" className="text-blue-500 text-sm mt-2 block hover:underline">
            最初の名刺を追加 →
          </Link>
        </div>
      ) : (
        <ContactsClient contacts={JSON.parse(JSON.stringify(contacts))} />
      )}
    </div>
  )
}
