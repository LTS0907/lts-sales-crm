/**
 * バックアップユーティリティ
 *
 * L3: Google Sheets へのエクスポート
 * L2: 暗号化JSON ダンプ（GitHub に送信）
 */
import { google } from 'googleapis'
import crypto from 'crypto'
import { prisma } from './prisma'

const BACKUP_SPREADSHEET_ID = '1XozVEvNAEl4kTJCJsu4OqfKNKpv3bloIjrWvn3XJEZI'

// ----------------------------------------------------------------
// Google Sheets 認証（サービスアカウント）
// ----------------------------------------------------------------

function getServiceAccountAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set')

  // Base64エンコード対応（改行対策）
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
    meetingParticipants, followUpLogs, taskLinks,
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

  // 各テーブルをそれぞれのシートに書き込み
  for (const [name, rows] of Object.entries(data)) {
    tableCounts[name] = rows.length
    const values = toSheetRows(rows as Record<string, unknown>[])

    // シートをクリア
    await sheets.spreadsheets.values.clear({
      spreadsheetId: BACKUP_SPREADSHEET_ID,
      range: `${name}!A1:ZZ100000`,
    }).catch(() => {})

    // 書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId: BACKUP_SPREADSHEET_ID,
      range: `${name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })
  }

  // BackupLog シートに記録追加
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

export async function backupToGithub(): Promise<{ success: true; commit: string; size: number; at: string }> {
  const token = process.env.GITHUB_BACKUP_TOKEN
  const repo = process.env.GITHUB_BACKUP_REPO // "owner/repo"
  const password = process.env.BACKUP_ENCRYPTION_PASSWORD
  if (!token || !repo || !password) {
    throw new Error('GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO / BACKUP_ENCRYPTION_PASSWORD が未設定')
  }

  // DBダンプ
  const data = await dumpAllTables()
  const json = JSON.stringify(data, null, 2)
  const encrypted = encrypt(json, password)

  // ファイル名: dumps/YYYY-MM-DD.enc
  const d = new Date()
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const path = `dumps/${dateStr}.enc`

  // GitHub API: PUT /repos/{owner}/{repo}/contents/{path}
  const [owner, repoName] = repo.split('/')
  const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`

  // 既存ファイルの sha を取得（上書き用）
  const existing = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  }).then(r => r.ok ? r.json() : null).catch(() => null)

  const contentBase64 = Buffer.from(encrypted).toString('base64')
  const body: Record<string, unknown> = {
    message: `backup: ${dateStr}`,
    content: contentBase64,
  }
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
    success: true,
    commit: result.commit?.sha || 'unknown',
    size: contentBase64.length,
    at: new Date().toISOString(),
  }
}
