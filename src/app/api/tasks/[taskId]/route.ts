import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getTasksClient } from '@/lib/google-tasks'

// PATCH /api/tasks/[taskId] — update task (complete/edit)
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
    // Find the task link to get taskListId
    const taskLink = await prisma.taskLink.findUnique({
      where: { googleTaskId: taskId },
    })
    if (!taskLink) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const client = getTasksClient(session.accessToken)

    const requestBody: any = {}
    if (body.status) requestBody.status = body.status
    if (body.title) requestBody.title = body.title
    if (body.notes !== undefined) requestBody.notes = body.notes
    if (body.due !== undefined) {
      requestBody.due = body.due ? new Date(body.due).toISOString() : null
    }
    // When completing, set completed timestamp
    if (body.status === 'completed') {
      requestBody.completed = new Date().toISOString()
    }

    const updated = await client.tasks.patch({
      tasklist: taskLink.taskListId,
      task: taskId,
      requestBody,
    })

    return NextResponse.json({
      id: updated.data.id,
      title: updated.data.title,
      status: updated.data.status,
      due: updated.data.due,
      completed: updated.data.completed,
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
    const taskLink = await prisma.taskLink.findUnique({
      where: { googleTaskId: taskId },
    })
    if (!taskLink) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const client = getTasksClient(session.accessToken)

    // Delete from Google Tasks
    await client.tasks.delete({
      tasklist: taskLink.taskListId,
      task: taskId,
    })

    // Delete local link
    await prisma.taskLink.delete({
      where: { googleTaskId: taskId },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Tasks DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
