/* ************************************************************************** */
/*                                                                            */
/*    route.ts                                          :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { contactId, service, phase } = await request.json()
  if (!contactId || !service || !phase) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const sp = await prisma.servicePhase.upsert({
    where: { contactId_service: { contactId, service } },
    create: { id: crypto.randomUUID(), updatedAt: new Date(), contactId, service, phase },
    update: { phase },
  })
  return NextResponse.json(sp)
}
