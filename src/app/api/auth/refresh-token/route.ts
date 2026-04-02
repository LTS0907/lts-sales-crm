import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Temporary endpoint to retrieve refresh token for cron setup
// DELETE THIS AFTER SETTING GOOGLE_REFRESH_TOKEN ENV VAR
export async function GET(request: Request) {
  const token = await getToken({
    req: request as any,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  })

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated. Log in first.' }, { status: 401 })
  }

  if (!token.refreshToken) {
    return NextResponse.json({
      error: 'No refresh token found. Re-login with prompt=consent to get one.',
    }, { status: 404 })
  }

  return NextResponse.json({
    message: 'Set this as GOOGLE_REFRESH_TOKEN in Vercel env vars, then delete this endpoint.',
    refreshToken: token.refreshToken,
  })
}
