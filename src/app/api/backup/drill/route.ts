/**
 * /api/backup/drill
 *
 * 復元ドリル: 最新のGitHubダンプをDLして復号・検証する（実DBには書き込まない）
 * - ダンプが開けるか
 * - テーブル件数が0でない主要テーブル（Contact等）があるか
 * - 暗号化スキームが有効か
 *
 * 月1 で Vercel Cron から呼ばれる
 */
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { notifyDiscord, saveBackupLog, jstDateStr } from '@/lib/backup'

export const maxDuration = 60

function decrypt(payload: string, password: string): string {
  const parts = payload.split(':')
  if (parts.length !== 5 || parts[0] !== 'AES-256-GCM') {
    throw new Error('Invalid encrypted payload format')
  }
  const [, saltB64, ivB64, tagB64, dataB64] = parts
  const salt = Buffer.from(saltB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const key = crypto.scryptSync(password, salt, 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = request.headers.get('Authorization')
  const expected = process.env.CRON_API_SECRET
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const errors: string[] = []
  let status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS'
  let tableCounts: Record<string, number> | undefined
  let notes = ''
  let dailyPath = ''

  try {
    const token = process.env.GITHUB_BACKUP_TOKEN
    const repo = process.env.GITHUB_BACKUP_REPO
    const password = process.env.BACKUP_ENCRYPTION_PASSWORD
    if (!token || !repo || !password) {
      throw new Error('GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO / BACKUP_ENCRYPTION_PASSWORD が未設定')
    }

    // 1) 当日または直近の dumps/YYYY-MM-DD.enc を取得
    const [owner, repoName] = repo.split('/')
    const today = jstDateStr()
    dailyPath = `dumps/${today}.enc`

    let encContent: string | null = null
    for (let i = 0; i < 3 && !encContent; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const path = `dumps/${jstDateStr(d)}.enc`
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (r.ok) {
        const json = await r.json()
        encContent = Buffer.from(json.content, 'base64').toString('utf8')
        dailyPath = path
        break
      }
    }
    if (!encContent) throw new Error('No recent dump found in last 3 days')

    // 2) 復号
    const plaintext = decrypt(encContent.trim(), password)
    const data = JSON.parse(plaintext)

    // 3) 検証
    tableCounts = {}
    for (const [name, rows] of Object.entries(data)) {
      tableCounts[name] = (rows as unknown[]).length
    }

    const contactCount = tableCounts['Contact'] || 0
    if (contactCount === 0) {
      status = 'PARTIAL'
      errors.push('Contact テーブルが0件（疑わしい状態）')
    }

    notes = `復元ドリル成功: ${dailyPath} from ${Object.keys(tableCounts).length} テーブル`
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    status = 'FAILED'
    notes = `復元ドリル失敗: ${msg}`
  }

  const durationMs = Date.now() - start

  await saveBackupLog({
    kind: 'DRILL',
    status,
    sheetsOk: false,
    githubOk: status !== 'FAILED',
    tableCounts,
    errors,
    durationMs,
    notes,
  })

  const totalRows = tableCounts ? Object.values(tableCounts).reduce((a, b) => a + b, 0) : 0
  const summary = [
    `🧪 **復元ドリル**`,
    `ステータス: **${status}**`,
    `対象: \`${dailyPath}\``,
    `検証テーブル数: ${tableCounts ? Object.keys(tableCounts).length : 0}`,
    `レコード合計: ${totalRows.toLocaleString()}`,
    errors.length > 0 ? `\n**エラー:**\n\`\`\`\n${errors.join('\n')}\n\`\`\`` : '',
    `経過時間: ${(durationMs / 1000).toFixed(1)}秒`,
  ].filter(Boolean).join('\n')

  await notifyDiscord(summary, status === 'FAILED')

  return NextResponse.json({ status, tableCounts, errors, durationMs, dailyPath }, {
    status: status === 'SUCCESS' ? 200 : status === 'PARTIAL' ? 207 : 500,
  })
}
