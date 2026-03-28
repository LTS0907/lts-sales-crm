/* ************************************************************************** */
/*                                                                            */
/*    relationship-parser.ts                            :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
export interface ParsedSegment {
  type: 'text' | 'link'
  content: string
  contactId?: string
}

export function parseRelationships(
  text: string,
  contacts: { id: string; name: string }[]
): ParsedSegment[] {
  if (!contacts.length || !text) return [{ type: 'text', content: text }]

  const sorted = [...contacts].sort((a, b) => b.name.length - a.name.length)
  const pattern = sorted.map(c => c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  if (!pattern) return [{ type: 'text', content: text }]

  const regex = new RegExp(`(${pattern})`, 'g')
  return text.split(regex).map(part => {
    const contact = sorted.find(c => c.name === part)
    return contact
      ? { type: 'link' as const, content: part, contactId: contact.id }
      : { type: 'text' as const, content: part }
  })
}
