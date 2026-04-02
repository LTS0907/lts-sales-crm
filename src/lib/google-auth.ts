/**
 * Google OAuth token refresh utility for cron/background jobs.
 *
 * Since cron endpoints run without a user session, we need to obtain
 * an access token from the stored refresh token. The refresh token is
 * passed as an environment variable (GOOGLE_REFRESH_TOKEN) which was
 * obtained during the initial NextAuth OAuth consent flow.
 */
export async function getAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!refreshToken) {
    throw new Error('GOOGLE_REFRESH_TOKEN is not set. Run the app and log in first to obtain it.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  }

  return data.access_token
}
