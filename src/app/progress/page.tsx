export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import ProgressClient from './ProgressClient'

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>
}) {
  const { service } = await searchParams

  const [servicePhases, allContacts] = await Promise.all([
    prisma.servicePhase.findMany({
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            company: true,
            title: true,
            recommendedServices: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.contact.findMany({
      where: { recommendedServices: { not: null } },
      select: {
        id: true,
        name: true,
        company: true,
        title: true,
        recommendedServices: true,
      },
    }),
  ])

  return (
    <ProgressClient
      servicePhases={servicePhases}
      allContacts={allContacts}
      selectedService={service}
    />
  )
}
