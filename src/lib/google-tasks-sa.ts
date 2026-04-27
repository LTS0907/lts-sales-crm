/**
 * Google Tasks Service Account クライアント
 *
 * Domain-Wide Delegation で各メンバー（ryouchiku@, r.kabashima@ 等）に impersonate して
 * Google Tasks の読み書きを行う。これにより「他人のタスクを見る/書き込む」が可能になる。
 *
 * 事前条件:
 * - GCP コンソールでサービスアカウントに以下スコープを委譲済みであること
 *   - https://www.googleapis.com/auth/tasks
 * - Vercel env の GOOGLE_SERVICE_ACCOUNT_KEY が有効
 */
import { google, tasks_v1 } from 'googleapis'

const CRM_LIST_TITLE = 'CRM'

function parseServiceAccountKey() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set')
  try {
    return JSON.parse(keyJson)
  } catch {
    const decoded = Buffer.from(keyJson, 'base64').toString('utf8')
    return JSON.parse(decoded)
  }
}

/** メンバーとして impersonate した Google Tasks クライアントを返す */
export async function getTasksClientForUser(userEmail: string): Promise<tasks_v1.Tasks> {
  const creds = parseServiceAccountKey()
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/tasks'],
    subject: userEmail,
  })
  await auth.authorize()
  return google.tasks({ version: 'v1', auth })
}

/** チームのタスク取得対象ユーザー一覧 */
export function getTeamTaskUsers(): string[] {
  const env = process.env.TEAM_TASK_USERS
  if (env) {
    return env.split(',').map(s => s.trim()).filter(Boolean)
  }
  // デフォルト
  return [
    'ryouchiku@life-time-support.com',
    'r.kabashima@life-time-support.com',
  ]
}

/** 表示名マッピング */
export const TASK_OWNER_NAMES: Record<string, string> = {
  'ryouchiku@life-time-support.com': '龍竹',
  'r.kabashima@life-time-support.com': '樺嶋',
}

export function getTaskOwnerName(email: string): string {
  return TASK_OWNER_NAMES[email] || email.split('@')[0]
}

/** 指定ユーザーの全タスクリストを取得 */
export async function listTaskListsForUser(
  userEmail: string
): Promise<{ id: string; title: string }[]> {
  const client = await getTasksClientForUser(userEmail)
  const res = await client.tasklists.list({ maxResults: 100 })
  const lists = (res.data.items || [])
    .filter(l => l.id && l.title)
    .map(l => ({ id: l.id!, title: l.title! }))
  // CRMリストを先頭に
  const crm = lists.filter(l => l.title === CRM_LIST_TITLE)
  const others = lists.filter(l => l.title !== CRM_LIST_TITLE)
  return [...crm, ...others]
}

/** 指定ユーザーのCRMリストID（無ければ作成） */
export async function getOrCreateCrmTaskListForUser(userEmail: string): Promise<string> {
  const client = await getTasksClientForUser(userEmail)
  const res = await client.tasklists.list({ maxResults: 100 })
  const existing = (res.data.items || []).find(l => l.title === CRM_LIST_TITLE)
  if (existing?.id) return existing.id

  const created = await client.tasklists.insert({
    requestBody: { title: CRM_LIST_TITLE },
  })
  return created.data.id!
}
