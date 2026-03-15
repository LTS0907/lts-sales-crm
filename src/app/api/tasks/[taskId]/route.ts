import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getTasksClient, getOrCreateCrmTaskList } from '@/lib/google-tasks'

// PATCH /api/tasks/[taskId] — update task
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

    const taskLink = await prisma.taskLink.findUnique({
      where: { googleTaskId: taskId },
    })
    const taskListId = taskLink?.taskListId || await getOrCreateCrmTaskList(client)

    // まず現在のタスクを取得
    const current = await client.tasks.get({
      tasklist: taskListId,
      task: taskId,
    })

    // 現在の値にリクエストの値をマージ
    const merged = { ...current.data }
    if (body.title !== undefined) merged.title = body.title
    if (body.notes !== undefined) merged.notes = body.notes
    if (body.due !== undefined) {
      merged.due = body.due ? new Date(body.due).toISOString() : undefined
    }
    if (body.status !== undefined) {
      merged.status = body.status
      if (body.status === 'completed') {
        merged.completed = new Date().toISOString()
      } else if (body.status === 'needsAction') {
        merged.completed = undefined
      }
    }

    // update（PUT）で全フィールドを送信
    const updated = await client.tasks.update({
      tasklist: taskListId,
      task: taskId,
      requestBody: merged,
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
  } catch (err: any) {
    console.error('Tasks PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
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

    const taskLink = await prisma.taskLink.findUnique({
      where: { googleTaskId: taskId },
    })
    const taskListId = taskLink?.taskListId || await getOrCreateCrmTaskList(client)

    await client.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    })

    if (taskLink) {
      await prisma.taskLink.delete({ where: { id: taskLink.id } }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Tasks DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
