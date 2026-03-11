export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import ContactForm from '@/components/contacts/ContactForm'
import Link from 'next/link'

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await prisma.contact.findUnique({ where: { id } })
  if (!contact) notFound()
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <Link href={`/contacts/${id}`} className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-2xl font-bold text-gray-900">{contact.name} を編集</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <ContactForm mode="edit" initialData={contact} />
      </div>
    </div>
  )
}
