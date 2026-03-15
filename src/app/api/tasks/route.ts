import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getTasksClient, getOrCreateCrmTaskList } from '@/lib/google-tasks'

// GET /api/tasks?contactId=xxx
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contactId = req.nextUrl.searchParams.get('contactId')

  try {
    const client = getTasksClient(session.accessToken)

    // Get TaskLinks from DB
    const where: any = {}
    if (contactId) where.contactId = contactId
    const taskLinks = await prisma.taskLink.findMany({
      where,
      include: { contact: { select: { id: true, name: true, company: true } } },
    })

    if (taskLinks.length === 0) {
      return NextResponse.json([])
    }

    // Fetch each task individually from Google Tasks using stored IDs
    const tasks = await Promise.all(
      taskLinks.map(async (tl) => {
        try {
          const res = await client.tasks.get({
            tasklist: tl.taskListId,
            task: tl.googleTaskId,
          })
          const gt = res.data
          return {
            id: gt.id,
            title: gt.title,
            notes: gt.notes,
            status: gt.status,
            due: gt.due,
            completed: gt.completed,
            updated: gt.updated,
            taskListId: tl.taskListId,
            contactId: tl.contactId,
            contactName: tl.contact.name,
            contactCompany: tl.contact.company,
            presetLabel: tl.presetLabel,
            linkId: tl.id,
          }
        } catch (err: any) {
          // Task was deleted from Google Tasks — clean up the orphaned link
          if (err.code === 404) {
            await prisma.taskLink.delete({ where: { id: tl.id } }).catch(() => {})
          }
          return null
        }
      })
    )

    return NextResponse.json(tasks.filter(Boolean))
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

  if (!contactId || !title) {
    return NextResponse.json({ error: 'contactId and title are required' }, { status: 400 })
  }

  try {
    const client = getTasksClient(session.accessToken)
    const taskListId = await getOrCreateCrmTaskList(client)

    // Look up contact name for the task notes
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { name: true, company: true },
    })

    const taskNotes = [
      notes || '',
      `---`,
      `お客様: ${contact?.name || ''}${contact?.company ? ` (${contact.company})` : ''}`,
    ].filter(Boolean).join('\n')

    // Create task in Google Tasks
    const requestBody: any = {
      title,
      notes: taskNotes,
      status: 'needsAction',
    }
    if (due) {
      requestBody.due = new Date(due).toISOString()
    }

    const created = await client.tasks.insert({
      tasklist: taskListId,
      requestBody,
    })

    // Save mapping locally
    const taskLink = await prisma.taskLink.create({
      data: {
        googleTaskId: created.data.id!,
        taskListId,
        contactId,
        presetLabel: presetLabel || null,
      },
    })

    return NextResponse.json({
      id: created.data.id,
      title: created.data.title,
      status: created.data.status,
      due: created.data.due,
      taskListId,
      contactId,
      presetLabel,
      linkId: taskLink.id,
    })
  } catch (err: any) {
    console.error('Tasks POST error:', err)
    if (err.message?.includes('insufficient') || err.code === 403) {
      return NextResponse.json({ error: 'Google Tasksの権限がありません。ログアウトして再ログインしてください。' }, { status: 403 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
