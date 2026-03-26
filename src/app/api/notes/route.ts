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
  const data = await request.json()
  const note = await prisma.note.create({ data: { id: crypto.randomUUID(), updatedAt: new Date(), content: data.content, category: data.category || 'GENERAL', contactId: data.contactId } })
  return NextResponse.json(note)
}
