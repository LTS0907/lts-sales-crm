import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import {
  getTasksClientForUser,
  getOrCreateCrmTaskListForUser,
  getTeamTaskUsers,
} from '@/lib/google-tasks-sa'
import { clearCached, tokenKey } from '@/lib/tasks-cache'

const CACHE_KEY_TEAM = 'team-tasks'

function invalidateCache() {
  clearCached(tokenKey(CACHE_KEY_TEAM))
}

function resolveOwner(req: NextRequest, body?: { ownerEmail?: string }, sessionEmail?: string): string {
  // 優先順: body.ownerEmail > query.ownerEmail > session.user.email
  const fromBody = body?.ownerEmail
  const fromQuery = req.nextUrl.searchParams.get('ownerEmail')
  const owner = fromBody || fromQuery || sessionEmail
  if (!owner) throw new Error('ownerEmail is required')
  return owner
}

// PATCH /api/tasks/[taskId]
// body: { ownerEmail?, taskListId?, status?, title?, notes?, due? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const body = await req.json()

  try {
    const ownerEmail = resolveOwner(req, body, session.user.email)
    const teamUsers = getTeamTaskUsers()
    if (!teamUsers.includes(ownerEmail)) {
      return NextResponse.json(
        { error: `${ownerEmail} はチームのタスク管理対象ではありません` },
        { status: 400 }
      )
    }

    const client = await getTasksClientForUser(ownerEmail)
    const taskListId = body.taskListId || await getOrCreateCrmTaskListForUser(ownerEmail)

    // 現在のタスクを取得
    const current = await client.tasks.get({ tasklist: taskListId, task: taskId })
    const c = current.data

    // 完了/未完了トグルのみ
    if (body.status && !body.title && body.notes === undefined && body.due === undefined) {
      const statusBody: { id?: string | null; status: string; completed?: string } = { id: c.id, status: body.status }
      if (body.status === 'completed') {
        statusBody.completed = new Date().toISOString()
      }
      const updated = await client.tasks.patch({
        tasklist: taskListId,
        task: taskId,
        requestBody: statusBody,
      })
      invalidateCache()
      return NextResponse.json({
        id: updated.data.id,
        title: updated.data.title,
        notes: updated.data.notes,
        status: updated.data.status,
        due: updated.data.due,
        completed: updated.data.completed,
        updated: updated.data.updated,
      })
    }

    // 編集: 旧タスク削除 → 新タスク作成
    await client.tasks.delete({ tasklist: taskListId, task: taskId })

    const newTask: { title?: string | null; notes?: string | null; status: string; due?: string; completed?: string } = {
      title: body.title !== undefined ? body.title : c.title,
      notes: body.notes !== undefined ? body.notes : (c.notes || undefined),
      status: body.status || c.status || 'needsAction',
    }
    if (body.due !== undefined) {
      if (body.due) newTask.due = new Date(body.due).toISOString()
    } else if (c.due) {
      newTask.due = c.due
    }
    if (newTask.status === 'completed') {
      newTask.completed = c.completed || new Date().toISOString()
    }

    const created = await client.tasks.insert({
      tasklist: taskListId,
      requestBody: newTask,
    })

    invalidateCache()

    return NextResponse.json({
      id: created.data.id,
      title: created.data.title,
      notes: created.data.notes,
      status: created.data.status,
      due: created.data.due,
      completed: created.data.completed,
      updated: created.data.updated,
    })
  } catch (err: unknown) {
    console.error('Tasks PATCH error:', (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.data || (err as Error).message || err)
    return NextResponse.json(
      { error: (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.data?.error?.message || (err as Error).message || 'タスク更新に失敗' },
      { status: (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.status || 500 }
    )
  }
}

// DELETE /api/tasks/[taskId]?taskListId=xxx&ownerEmail=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const taskListId = req.nextUrl.searchParams.get('taskListId')

  try {
    const ownerEmail = resolveOwner(req, undefined, session.user.email)
    const teamUsers = getTeamTaskUsers()
    if (!teamUsers.includes(ownerEmail)) {
      return NextResponse.json(
        { error: `${ownerEmail} はチームのタスク管理対象ではありません` },
        { status: 400 }
      )
    }

    const client = await getTasksClientForUser(ownerEmail)
    const resolvedListId = taskListId || await getOrCreateCrmTaskListForUser(ownerEmail)

    await client.tasks.delete({ tasklist: resolvedListId, task: taskId })

    invalidateCache()

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('Tasks DELETE error:', (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.data || (err as Error).message || err)
    return NextResponse.json(
      { error: (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.data?.error?.message || (err as Error).message || 'タスク削除に失敗' },
      { status: (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.status || 500 }
    )
  }
}
