/* ************************************************************************** */
/*                                                                            */
/*    route.ts                                          :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/04/13 by Claude (LTS)              #+#    #+#         */
/*    Updated: 2026/04/13 by Claude (LTS)              ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { contacts } = await request.json()
  if (!Array.isArray(contacts) || contacts.length === 0)
    return NextResponse.json({ error: 'contacts が空です' }, { status: 400 })

  const created = []
  const groupSuggestions = []

  for (const data of contacts) {
    if (!data.name || data.name.trim() === '') continue
    const contact = await prisma.contact.create({
      data: {
        id: data.id || crypto.randomUUID(),
        updatedAt: new Date(),
        name: data.name,
        nameKana: data.nameKana || null,
        connectionType: data.connectionType || null,
        company: data.company || null,
        department: data.department || null,
        title: data.title || null,
        email: data.email || null,
        phone: data.phone || null,
        lineId: data.lineId || null,
        gmailAlias: data.gmailAlias || null,
        website: data.website || null,
        address: data.address || null,
        episodeMemo: data.episodeMemo || null,
      },
    })
    created.push(contact)

    if (contact.company) {
      const existing = await prisma.group.findFirst({
        where: { name: contact.company, type: 'COMPANY' },
      })
      if (existing) {
        groupSuggestions.push({
          contactId: contact.id,
          groupId: existing.id,
          groupName: existing.name,
          type: 'COMPANY',
        })
      }
    }
  }

  return NextResponse.json({ count: created.length, contacts: created, groupSuggestions })
}
