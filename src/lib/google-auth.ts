/**
 * Google OAuth token utility for cron/background jobs.
 *
 * Supports two modes:
 * 1. GOOGLE_REFRESH_TOKEN env var (Vercel production)
 * 2. gws CLI credentials file (local/server environments)
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface GwsCredentials {
  client_id: string
  client_secret: string
  refresh_token: string
}

function loadGwsCredentials(): GwsCredentials | null {
  // Try standard gws credentials paths
  const homedir = process.env.USERPROFILE || process.env.HOME || ''
  const paths = [
    join(homedir, '.config', 'gws', 'credentials.json'),
    join(homedir, '.config', 'gws', 'credentials.enc'),
  ]

  for (const credPath of paths) {
    if (existsSync(credPath) && credPath.endsWith('.json')) {
      try {
        const raw = JSON.parse(readFileSync(credPath, 'utf-8'))
        if (raw.client_id && raw.client_secret && raw.refresh_token) {
          return raw
        }
      } catch { /* ignore */ }
    }
  }

  // Try gws client_secret.json + separate token
  const clientSecretPath = join(homedir, '.config', 'gws', 'client_secret.json')
  if (existsSync(clientSecretPath)) {
    try {
      const clientSecret = JSON.parse(readFileSync(clientSecretPath, 'utf-8'))
      const installed = clientSecret.installed || clientSecret.web
      if (installed) {
        // Check for token file
        const tokenPath = join(homedir, '.config', 'gws', 'token.json')
        if (existsSync(tokenPath)) {
          const token = JSON.parse(readFileSync(tokenPath, 'utf-8'))
          if (token.refresh_token) {
            return {
              client_id: installed.client_id,
              client_secret: installed.client_secret,
              refresh_token: token.refresh_token,
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  return null
}

export async function getAccessToken(): Promise<string> {
  // Mode 1: Env var (Vercel)
  const envRefreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (envRefreshToken) {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required with GOOGLE_REFRESH_TOKEN')
    }
    return refreshAccessToken(clientId, clientSecret, envRefreshToken)
  }

  // Mode 2: gws CLI credentials (local/server)
  const gwsCreds = loadGwsCredentials()
  if (gwsCreds) {
    return refreshAccessToken(gwsCreds.client_id, gwsCreds.client_secret, gwsCreds.refresh_token)
  }

  throw new Error('No Google credentials found. Set GOOGLE_REFRESH_TOKEN env var or install gws CLI.')
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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
