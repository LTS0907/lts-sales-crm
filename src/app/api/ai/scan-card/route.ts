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
import { scanBusinessCard } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here')
    return NextResponse.json({ error: 'GEMINI_API_KEYが設定されていません' }, { status: 500 })
  const formData = await request.formData()
  const file = formData.get('image') as File
  if (!file) return NextResponse.json({ error: '画像がありません' }, { status: 400 })
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  try {
    const data = await scanBusinessCard(base64, file.type || 'image/jpeg')
    return NextResponse.json(data)
  } catch { return NextResponse.json({ error: '解析失敗' }, { status: 500 }) }
}
