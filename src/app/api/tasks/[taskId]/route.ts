import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getTasksClient, getOrCreateCrmTaskList } from '@/lib/google-tasks'

// PATCH /api/tasks/[taskId] — 削除→再作成で確実にGoogle同期
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const body = await req.json()

  try {
    const client = getTasksClient(session.accessToken)
    const taskListId = await getOrCreateCrmTaskList(client)

    // 現在のタスクを取得
    const current = await client.tasks.get({ tasklist: taskListId, task: taskId })
    const c = current.data

    // 完了/未完了トグルのみ
    if (body.status && !body.title && body.notes === undefined && body.due === undefined) {
      const statusBody: any = { id: c.id, status: body.status }
      if (body.status === 'completed') {
        statusBody.completed = new Date().toISOString()
      }
      const updated = await client.tasks.patch({
        tasklist: taskListId,
        task: taskId,
        requestBody: statusBody,
      })
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

    const newTask: any = {
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

    return NextResponse.json({
      id: created.data.id,
      title: created.data.title,
      notes: created.data.notes,
      status: created.data.status,
      due: created.data.due,
      completed: created.data.completed,
      updated: created.data.updated,
    })
  } catch (err: any) {
    console.error('Tasks PATCH error:', err?.response?.data || err.message || err)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err.message || 'タスク更新に失敗' },
      { status: err?.response?.status || 500 }
    )
  }
}

// DELETE /api/tasks/[taskId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params

  try {
    const client = getTasksClient(session.accessToken)
    const taskListId = await getOrCreateCrmTaskList(client)

    await client.tasks.delete({ tasklist: taskListId, task: taskId })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Tasks DELETE error:', err?.response?.data || err.message || err)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err.message || 'タスク削除に失敗' },
      { status: err?.response?.status || 500 }
    )
  }
}
