import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getTasksClient, getOrCreateCrmTaskList, getAllTaskLists } from '@/lib/google-tasks'

// GET /api/tasks — 全Google Tasksリストのタスクを返す
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = getTasksClient(session.accessToken)
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

    return NextResponse.json({
      taskLists,
      tasks: allTasks.flat(),
    })
  } catch (err: any) {
    console.error('Tasks GET error:', err)
    if (err.message?.includes('insufficient') || err.code === 403) {
      return NextResponse.json({ error: 'Google Tasksの権限がありません。ログアウトして再ログインしてください。' }, { status: 403 })
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
