/**
 * /api/backup/run
 *
 * 全バックアップを実行（Sheets + GitHub）
 * Vercel Cron から daily で呼ばれる
 * Authorization: Bearer <CRON_API_SECRET> が必要
 */
import { NextResponse } from 'next/server'
import { backupToSheets, backupToGithub } from '@/lib/backup'

export const maxDuration = 60 // Vercel Pro/Team なら 300 にできる

export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  // Vercel Cron は Bearer CRON_SECRET を送ってくる
  const auth = request.headers.get('Authorization')
  const expected = process.env.CRON_API_SECRET
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: {
    sheets?: unknown
    github?: unknown
    errors: string[]
  } = { errors: [] }

  // L3: Google Sheets
  try {
    results.sheets = await backupToSheets()
    console.log('[backup] Sheets OK')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`sheets: ${msg}`)
    console.error('[backup] Sheets failed:', msg)
  }

  // L2: GitHub dump
  try {
    results.github = await backupToGithub()
    console.log('[backup] GitHub OK')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`github: ${msg}`)
    console.error('[backup] GitHub failed:', msg)
  }

  const status = results.errors.length === 0 ? 200 : (results.sheets || results.github ? 207 : 500)
  return NextResponse.json(results, { status })
}
