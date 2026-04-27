import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  getTasksClientForUser,
  listTaskListsForUser,
  getOrCreateCrmTaskListForUser,
  getTeamTaskUsers,
  getTaskOwnerName,
} from '@/lib/google-tasks-sa'
import {
  TasksPayload,
  tokenKey,
  getCached,
  getStale,
  setCached,
  clearCached,
  isQuotaBackoff,
  startQuotaBackoff,
} from '@/lib/tasks-cache'

const CACHE_KEY_TEAM = 'team-tasks'

// GET /api/tasks — 全メンバーのGoogle Tasksを集約して返す（キャッシュ + 429バックオフ付き）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. ホットキャッシュ命中なら即返却（チーム全員分は同じデータなので共有キーでOK）
  const cacheKey = tokenKey(CACHE_KEY_TEAM)
  const fresh = getCached(cacheKey)
  if (fresh) {
    return NextResponse.json(fresh, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  }

  // 2. クォータ超過バックオフ中なら、古いキャッシュ（あれば）を返す or 429
  if (isQuotaBackoff(cacheKey)) {
    const stale = getStale(cacheKey)
    if (stale) {
      return NextResponse.json(stale, {
        headers: { 'Cache-Control': 'private, max-age=30', 'X-Quota-Stale': '1' },
      })
    }
    return NextResponse.json(
      {
        error: 'Google Tasks APIのクォータ上限に達しています。10分後に自動で再試行します。',
        tasks: [],
        taskLists: [],
      },
      { status: 429 }
    )
  }

  const teamUsers = getTeamTaskUsers()

  try {
    // 各メンバーごとに並列でタスクを取得
    const perUser = await Promise.all(
      teamUsers.map(async (userEmail) => {
        try {
          const client = await getTasksClientForUser(userEmail)
          const taskLists = await listTaskListsForUser(userEmail)

          const lists = await Promise.all(
            taskLists.map(async (list) => {
              const res = await client.tasks.list({
                tasklist: list.id,
                maxResults: 100,
                showCompleted: true,
                showHidden: true,
              })
              return (res.data.items || []).map(t => ({
                id: t.id,
                title: t.title,
                notes: t.notes,
                status: t.status,
                due: t.due,
                completed: t.completed,
                updated: t.updated,
                position: t.position,
                taskListId: list.id,
                taskListTitle: list.title,
                ownerEmail: userEmail,
                ownerName: getTaskOwnerName(userEmail),
              }))
            })
          )

          return {
            userEmail,
            ownerName: getTaskOwnerName(userEmail),
            taskLists: taskLists.map(l => ({
              id: l.id,
              title: l.title,
              ownerEmail: userEmail,
              ownerName: getTaskOwnerName(userEmail),
            })),
            tasks: lists.flat(),
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`[tasks] failed for ${userEmail}:`, msg)
          return { userEmail, ownerName: getTaskOwnerName(userEmail), taskLists: [], tasks: [], error: msg }
        }
      })
    )

    // 各メンバーの取得サマリをログに出力（デバッグ用）
    for (const u of perUser) {
      const note = u.tasks.length === 0 && (u as { error?: string }).error
        ? `0 tasks (error: ${(u as { error?: string }).error})`
        : `${u.tasks.length} tasks across ${u.taskLists.length} lists`
      console.log(`[tasks] ${u.userEmail}: ${note}`)
    }

    const payload: TasksPayload = {
      taskLists: perUser.flatMap(u => u.taskLists),
      tasks: perUser.flatMap(u => u.tasks),
    }
    setCached(cacheKey, payload)

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (err: unknown) {
    console.error('Tasks GET error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Quota exceeded') || (err as { code?: number })?.code === 429) {
      startQuotaBackoff(cacheKey)
      const stale = getStale(cacheKey)
      if (stale) {
        return NextResponse.json(stale, {
          headers: { 'Cache-Control': 'private, max-age=30', 'X-Quota-Stale': '1' },
        })
      }
      return NextResponse.json(
        {
          error:
            'Google Tasks APIの1日あたりリクエスト上限に達しました。明日には自動的に復旧します。',
          tasks: [],
          taskLists: [],
        },
        { status: 429 }
      )
    }
    if (msg.includes('unauthorized_client') || msg.includes('insufficient')) {
      return NextResponse.json(
        {
          error:
            'Google Workspace のドメインワイド委譲に Tasks スコープ未設定の可能性があります。管理者に連絡してください。',
          tasks: [],
          taskLists: [],
        },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/tasks
// body: { contactId?, title, notes?, due?, presetLabel?, ownerEmail? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { contactId, title, notes, due, presetLabel, ownerEmail } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // 作成先のメンバーを決定（指定がなければ自分）
  const targetUser = (ownerEmail || session.user.email) as string
  const teamUsers = getTeamTaskUsers()
  if (!teamUsers.includes(targetUser)) {
    return NextResponse.json(
      { error: `${targetUser} はチームのタスク管理対象ではありません` },
      { status: 400 }
    )
  }

  try {
    const client = await getTasksClientForUser(targetUser)
    const taskListId = await getOrCreateCrmTaskListForUser(targetUser)

    // Build notes with contact info if contactId provided
    let taskNotes = notes || ''
    if (contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { name: true, company: true },
      })
      if (contact) {
        taskNotes = [
          taskNotes,
          `---`,
          `お客様: ${contact.name}${contact.company ? ` (${contact.company})` : ''}`,
        ].filter(Boolean).join('\n')
      }
    }

    const requestBody: { title: string; notes?: string; status: string; due?: string } = {
      title,
      notes: taskNotes || undefined,
      status: 'needsAction',
    }
    if (due) {
      requestBody.due = new Date(due).toISOString()
    }

    const created = await client.tasks.insert({
      tasklist: taskListId,
      requestBody,
    })

    // チーム全体キャッシュを破棄
    clearCached(tokenKey(CACHE_KEY_TEAM))

    // Save link if contactId provided
    if (contactId) {
      await prisma.taskLink.create({
        data: {
          id: crypto.randomUUID(),
          googleTaskId: created.data.id!,
          taskListId,
          contactId,
          presetLabel: presetLabel || null,
        },
      }).catch(() => {}) // non-critical
    }

    return NextResponse.json({
      id: created.data.id,
      title: created.data.title,
      status: created.data.status,
      due: created.data.due,
      notes: created.data.notes,
      ownerEmail: targetUser,
      ownerName: getTaskOwnerName(targetUser),
    })
  } catch (err: unknown) {
    console.error('Tasks POST error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
