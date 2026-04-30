import { NextRequest, NextResponse } from 'next/server'
import { scanBusinessCard } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
    return NextResponse.json({ error: 'GEMINI_API_KEYが設定されていません' }, { status: 500 })
  }

  const formData = await request.formData()

  // 多画像対応: 'images' (複数) と 'image' (旧来1枚) の両方を受け取る
  const files: File[] = []
  for (const v of formData.getAll('images')) {
    if (v instanceof File && v.size > 0) files.push(v)
  }
  const single = formData.get('image')
  if (single instanceof File && single.size > 0) files.push(single)

  if (files.length === 0) {
    return NextResponse.json({ error: '画像がありません' }, { status: 400 })
  }

  try {
    const images = await Promise.all(
      files.map(async f => ({
        base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
        mimeType: f.type || 'image/jpeg',
      }))
    )
    const data = await scanBusinessCard(images)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[scan-card] error:', e)
    return NextResponse.json({ error: '解析失敗' }, { status: 500 })
  }
}
