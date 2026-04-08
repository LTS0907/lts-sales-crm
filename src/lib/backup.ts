/**
 * バックアップユーティリティ
 *
 * L3: Google Sheets へのエクスポート
 * L2: 暗号化JSON ダンプ（GitHub に送信）
 *      - dumps/YYYY-MM-DD.enc         ... 当日の最新（上書き）
 *      - dumps/archive/YYYY-MM-DD_HHMMSS.enc ... 履歴（ユニーク）
 *      - 保持期間: dumps/直下は30日、archive/は全保持
 * L1: DB-level PITR
 *      - Neon の場合、自動で24時間（無料）または最大30日（有料）有効
 *      - Neon Console → Backup & Restore
 */
import { google } from 'googleapis'
import crypto from 'crypto'
import { prisma } from './prisma'

const BACKUP_SPREADSHEET_ID = '1XozVEvNAEl4kTJCJsu4OqfKNKpv3bloIjrWvn3XJEZI'
const DAILY_RETENTION_DAYS = 30

// ----------------------------------------------------------------
// JST 日時ヘルパー
// ----------------------------------------------------------------

/** 現在の JST 日付文字列 YYYY-MM-DD */
export function jstDateStr(d: Date = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 現在の JST 日時文字列 YYYY-MM-DD_HHMMSS */
export function jstDateTimeStr(d: Date = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const mo = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const da = String(jst.getUTCDate()).padStart(2, '0')
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  const ss = String(jst.getUTCSeconds()).padStart(2, '0')
  return `${y}-${mo}-${da}_${hh}${mm}${ss}`
}

// ----------------------------------------------------------------
// Google Sheets 認証（サービスアカウント）
// ----------------------------------------------------------------

function getServiceAccountAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set')

  let parsed
  try {
    parsed = JSON.parse(keyJson)
  } catch {
    const decoded = Buffer.from(keyJson, 'base64').toString('utf8')
    parsed = JSON.parse(decoded)
  }

  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// ----------------------------------------------------------------
// DB → JSON エクスポート
// ----------------------------------------------------------------

export async function dumpAllTables() {
  const [
    contacts, notes, exchanges, subscriptions, billingRecords,
    receivables, revenues, payments, paymentAllocations,
    servicePhases, contracts, groups, groupMembers, meetings,
    meetingParticipants, followUpLogs, taskLinks, backupLogs,
  ] = await Promise.all([
    prisma.contact.findMany(),
    prisma.note.findMany(),
    prisma.exchange.findMany(),
    prisma.subscription.findMany(),
    prisma.billingRecord.findMany(),
    prisma.accountsReceivable.findMany(),
    prisma.revenue.findMany(),
    prisma.paymentTransaction.findMany(),
    prisma.paymentAllocation.findMany(),
    prisma.servicePhase.findMany(),
    prisma.contract.findMany(),
    prisma.group.findMany(),
    prisma.groupMember.findMany(),
    prisma.meeting.findMany(),
    prisma.meetingParticipant.findMany(),
    prisma.followUpLog.findMany(),
    prisma.taskLink.findMany(),
    prisma.backupLog.findMany({ orderBy: { executedAt: 'desc' }, take: 100 }),
  ])

  return {
    Contact: contacts,
    Note: notes,
    Exchange: exchanges,
    Subscription: subscriptions,
    BillingRecord: billingRecords,
    AccountsReceivable: receivables,
    Revenue: revenues,
    PaymentTransaction: payments,
    PaymentAllocation: paymentAllocations,
    ServicePhase: servicePhases,
    Contract: contracts,
    Group: groups,
    GroupMember: groupMembers,
    Meeting: meetings,
    MeetingParticipant: meetingParticipants,
    FollowUpLog: followUpLogs,
    TaskLink: taskLinks,
    BackupLog: backupLogs,
  }
}

// ----------------------------------------------------------------
// L3: Google Sheets エクスポート
// ----------------------------------------------------------------

function toSheetRows(rows: Record<string, unknown>[]): unknown[][] {
  if (rows.length === 0) return [['(no data)']]
  const keys = Object.keys(rows[0])
  const header = keys
  const body = rows.map(r => keys.map(k => {
    const v = r[k]
    if (v === null || v === undefined) return ''
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }))
  return [header, ...body]
}

export async function backupToSheets(): Promise<{ success: true; tables: Record<string, number>; at: string }> {
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const data = await dumpAllTables()
  const tableCounts: Record<string, number> = {}

  for (const [name, rows] of Object.entries(data)) {
    tableCounts[name] = rows.length
    const values = toSheetRows(rows as Record<string, unknown>[])

    await sheets.spreadsheets.values.clear({
      spreadsheetId: BACKUP_SPREADSHEET_ID,
      range: `${name}!A1:ZZ100000`,
    }).catch(() => {})

    await sheets.spreadsheets.values.update({
      spreadsheetId: BACKUP_SPREADSHEET_ID,
      range: `${name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })
  }

  const logEntry = [
    [new Date().toISOString(), 'SUCCESS', JSON.stringify(tableCounts)],
  ]
  await sheets.spreadsheets.values.append({
    spreadsheetId: BACKUP_SPREADSHEET_ID,
    range: 'BackupLog!A:C',
    valueInputOption: 'RAW',
    requestBody: { values: logEntry },
  }).catch(() => {})

  return { success: true, tables: tableCounts, at: new Date().toISOString() }
}

// ----------------------------------------------------------------
// L2: 暗号化 JSON ダンプ → GitHub プッシュ
// ----------------------------------------------------------------

function encrypt(plaintext: string, password: string): string {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(password, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'AES-256-GCM',
    salt.toString('base64'),
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

async function githubPut(
  repo: string,
  token: string,
  path: string,
  contentBase64: string,
  message: string,
): Promise<{ commit: string; url: string }> {
  const [owner, repoName] = repo.split('/')
  const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`

  const existing = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  }).then(r => r.ok ? r.json() : null).catch(() => null)

  const body: Record<string, unknown> = { message, content: contentBase64 }
  if (existing?.sha) body.sha = existing.sha

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub push failed: ${res.status} ${err.slice(0, 200)}`)
  }
  const result = await res.json()
  return {
    commit: result.commit?.sha || 'unknown',
    url: result.content?.html_url || '',
  }
}

export async function backupToGithub(): Promise<{ success: true; commit: string; size: number; at: string; dailyPath: string; archivePath: string; url: string }> {
  const token = process.env.GITHUB_BACKUP_TOKEN
  const repo = process.env.GITHUB_BACKUP_REPO
  const password = process.env.BACKUP_ENCRYPTION_PASSWORD
  if (!token || !repo || !password) {
    throw new Error('GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO / BACKUP_ENCRYPTION_PASSWORD が未設定')
  }

  const data = await dumpAllTables()
  const json = JSON.stringify(data, null, 2)
  const encrypted = encrypt(json, password)
  const contentBase64 = Buffer.from(encrypted).toString('base64')

  const dateStr = jstDateStr()
  const datetimeStr = jstDateTimeStr()
  const dailyPath = `dumps/${dateStr}.enc`
  const archivePath = `dumps/archive/${datetimeStr}.enc`

  // 1) 当日最新を上書き
  const dailyResult = await githubPut(repo, token, dailyPath, contentBase64, `backup: ${dateStr} (latest)`)
  // 2) アーカイブに履歴保存
  await githubPut(repo, token, archivePath, contentBase64, `backup: ${datetimeStr} (archive)`)

  return {
    success: true,
    commit: dailyResult.commit,
    size: contentBase64.length,
    at: new Date().toISOString(),
    dailyPath,
    archivePath,
    url: dailyResult.url,
  }
}

// ----------------------------------------------------------------
// 保持期間クリーンアップ: 30日以上前の dumps/YYYY-MM-DD.enc を削除
// （archive/ は触らない）
// ----------------------------------------------------------------

export async function cleanupOldBackups(): Promise<{ success: true; deleted: string[]; at: string }> {
  const token = process.env.GITHUB_BACKUP_TOKEN
  const repo = process.env.GITHUB_BACKUP_REPO
  if (!token || !repo) throw new Error('GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO が未設定')

  const [owner, repoName] = repo.split('/')
  const listUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/dumps`
  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`)
  const items = await res.json() as Array<{ name: string; path: string; sha: string; type: string }>

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DAILY_RETENTION_DAYS)
  const cutoffStr = jstDateStr(cutoff)

  const toDelete = items.filter(it =>
    it.type === 'file' &&
    /^\d{4}-\d{2}-\d{2}\.enc$/.test(it.name) &&
    it.name.slice(0, 10) < cutoffStr
  )

  const deleted: string[] = []
  for (const item of toDelete) {
    const delUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${item.path}`
    const r = await fetch(delUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `cleanup: ${item.name}`, sha: item.sha }),
    })
    if (r.ok) deleted.push(item.name)
  }
  return { success: true, deleted, at: new Date().toISOString() }
}

// ----------------------------------------------------------------
// Discord 通知
// ----------------------------------------------------------------

export async function notifyDiscord(message: string, isError = false): Promise<void> {
  const webhook = process.env.DISCORD_BACKUP_WEBHOOK_URL
  if (!webhook) return // 未設定ならスキップ

  const content = isError ? `🚨 **[BACKUP ERROR]**\n${message}` : `✅ **[BACKUP]**\n${message}`
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    })
  } catch (e) {
    console.error('[notifyDiscord] failed:', e)
  }
}

// ----------------------------------------------------------------
// BackupLog 記録
// ----------------------------------------------------------------

export interface BackupLogEntry {
  kind: 'BACKUP' | 'DRILL' | 'CLEANUP'
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  sheetsOk?: boolean
  githubOk?: boolean
  driveDumpUrl?: string
  tableCounts?: Record<string, number>
  errors?: string[]
  durationMs: number
  notes?: string
}

export async function saveBackupLog(entry: BackupLogEntry): Promise<void> {
  try {
    await prisma.backupLog.create({
      data: {
        kind: entry.kind,
        status: entry.status,
        sheetsOk: entry.sheetsOk ?? false,
        githubOk: entry.githubOk ?? false,
        driveDumpUrl: entry.driveDumpUrl ?? null,
        tableCounts: entry.tableCounts ?? undefined,
        errors: entry.errors ?? [],
        durationMs: entry.durationMs,
        notes: entry.notes ?? null,
      },
    })
  } catch (e) {
    console.error('[saveBackupLog] failed:', e)
  }
}
