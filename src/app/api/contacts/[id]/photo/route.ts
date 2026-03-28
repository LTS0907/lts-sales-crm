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
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const formData = await request.formData()
  const file = formData.get('photo') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  const ext = file.name.split('.').pop() || 'jpg'
  const dir = path.join(process.cwd(), 'public', 'uploads', id)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `photo.${ext}`), Buffer.from(await file.arrayBuffer()))
  const photoPath = `/uploads/${id}/photo.${ext}`
  await prisma.contact.update({ where: { id }, data: { photoPath } })
  return NextResponse.json({ photoPath })
}
