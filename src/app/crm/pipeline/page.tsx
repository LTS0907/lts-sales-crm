export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import PipelineBoard from '@/components/crm/PipelineBoard'

export default async function PipelinePage() {
  const contacts = await prisma.contact.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      company: true,
      emailStatus: true,
      touchNumber: true,
      salesPhase: true,
    },
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">パイプライン</h1>
      <PipelineBoard initialContacts={contacts} />
    </div>
  )
}
