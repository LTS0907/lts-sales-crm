/* ************************************************************************** */
/*                                                                            */
/*    route.ts                                          :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getTasksClient, getOrCreateCrmTaskList, getAllTaskLists } from '@/lib/google-tasks'
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

// GET /api/tasks — 全Google Tasksリストのタスクを返す（キャッシュ + 429バックオフ付き）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = session.accessToken as string
  const cacheKey = tokenKey(accessToken)

  // 1. ホットキャッシュ命中なら即返却
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

  try {
    const client = getTasksClient(accessToken)
    const taskLists = await getAllTaskLists(client)

    const allTasks = await Promise.all(
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
        }))
      })
    )

    const payload: TasksPayload = {
      taskLists: taskLists.map(l => ({ id: l.id!, title: l.title! })),
      tasks: allTasks.flat(),
    }
    setCached(cacheKey, payload)

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (err: any) {
    console.error('Tasks GET error:', err)
    if (err.message?.includes('insufficient') || err.code === 403) {
      return NextResponse.json({ error: 'Google Tasksの権限がありません。ログアウトして再ログインしてください。' }, { status: 403 })
    }
    const msg = String(err?.message || '')
    if (msg.includes('Quota exceeded') || err?.code === 429) {
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
            'Google Tasks APIの1日あたりリクエスト上限に達しました。明日には自動的に復旧します。お急ぎの場合は管理者がGoogle Cloudコンソールでクォータ増を申請できます。',
          tasks: [],
          taskLists: [],
        },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { contactId, title, notes, due, presetLabel } = await req.json()

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  try {
    const client = getTasksClient(session.accessToken)
    const taskListId = await getOrCreateCrmTaskList(client)

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

    const requestBody: any = {
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

    // 変更があったのでこのユーザーのキャッシュを破棄
    clearCached(tokenKey(session.accessToken as string))

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
    })
  } catch (err: any) {
    console.error('Tasks POST error:', err)
    if (err.message?.includes('insufficient') || err.code === 403) {
      return NextResponse.json({ error: 'Google Tasksの権限がありません。ログアウトして再ログインしてください。' }, { status: 403 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
