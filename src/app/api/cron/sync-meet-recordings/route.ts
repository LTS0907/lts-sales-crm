/**
 * GET /api/cron/sync-meet-recordings
 *
 * Vercel Cron 用エンドポイント（定期実行）。
 * Meet Recordings フォルダをポーリングして、
 * 新しい議事録を Meeting レコードと紐付け → 要約 → Note/Task生成。
 *
 * 認証:
 * - Vercel Cron は CRON_SECRET を x-vercel-cron-signature ヘッダで渡す
 * - OAuth access token は GOOGLE_REFRESH_TOKEN から毎回 refresh して取得
 */
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { syncMeetRecordings } from '@/lib/meet-transcript-sync'

export const maxDuration = 300 // 5分（Vercel Pro 以上で延長可能）

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials が未設定です (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)')
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2.refreshAccessToken()
  if (!credentials.access_token) {
    throw new Error('access_token の取得に失敗しました')
  }
  return credentials.access_token
}

export async function GET(request: NextRequest) {
  // 認証チェック（Vercel Cron または CRON_SECRET）
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '')
  const isVercelCron = request.headers.get('x-vercel-cron-signature') !== null
  const isAuthorized = isVercelCron || (cronSecret && cronSecret === process.env.CRON_SECRET)

  if (!isAuthorized && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accessToken = await getAccessToken()
    const result = await syncMeetRecordings(accessToken)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (err: unknown) {
    console.error('[cron/sync-meet-recordings] Fatal error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  }
}
