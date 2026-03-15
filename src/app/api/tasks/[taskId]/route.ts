import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getTasksClient, getOrCreateCrmTaskList } from '@/lib/google-tasks'

async function getTaskListId(taskId: string, client: any) {
  const taskLink = await prisma.taskLink.findUnique({
    where: { googleTaskId: taskId },
  })
  if (taskLink) return taskLink.taskListId
  return getOrCreateCrmTaskList(client)
}

// PATCH /api/tasks/[taskId]
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
    const taskListId = await getTaskListId(taskId, client)

    // 現在のタスクを取得
    const current = await client.tasks.get({ tasklist: taskListId, task: taskId })
    const c = current.data

    // 更新可能なフィールドだけを構築
    const requestBody: any = {
      id: c.id,
      title: body.title !== undefined ? body.title : c.title,
      notes: body.notes !== undefined ? body.notes : (c.notes || ''),
      status: body.status !== undefined ? body.status : c.status,
    }

    // 期限
    if (body.due !== undefined) {
      if (body.due) {
        requestBody.due = new Date(body.due).toISOString()
      }
      // due=null の場合はフィールドを含めない（期限削除）
    } else if (c.due) {
      requestBody.due = c.due
    }

    // 完了
    if (body.status === 'completed') {
      requestBody.completed = new Date().toISOString()
    } else if (body.status === 'needsAction') {
      // completedを含めない
    } else if (c.completed) {
      requestBody.completed = c.completed
    }

    const updated = await client.tasks.update({
      tasklist: taskListId,
      task: taskId,
      requestBody,
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
    const taskListId = await getTaskListId(taskId, client)

    await client.tasks.delete({ tasklist: taskListId, task: taskId })

    await prisma.taskLink.deleteMany({ where: { googleTaskId: taskId } }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Tasks DELETE error:', err?.response?.data || err.message || err)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err.message || 'タスク削除に失敗' },
      { status: err?.response?.status || 500 }
    )
  }
}
