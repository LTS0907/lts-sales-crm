/**
 * POST /api/contacts/[id]/tasks/from-minutes
 *
 * 議事録のアクションアイテムから Google Tasks に親+サブタスクを一括登録する。
 *
 * - 親タスク: 「議事録: {顧客名} ({日付})」というタスクリストのアイテム
 * - サブタスク: 各アクションアイテムを子タスクとして登録
 * - 二重登録防止: Meeting.minutesTasksRegisteredAt がセット済みなら 409
 * - TaskLink: 親タスクのみ contactId + presetLabel="minutes" で保存
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  getTasksClientForUser,
  getOrCreateCrmTaskListForUser,
  getTeamTaskUsers,
} from '@/lib/google-tasks-sa'

interface SubtaskInput {
  title: string
  detail?: string
  due?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: contactId } = await params

  const body = await req.json()
  const { meetingId, parentTitle, subtasks, ownerEmail } = body as {
    meetingId: string
    parentTitle: string
    subtasks: SubtaskInput[]
    ownerEmail?: string
  }

  if (!meetingId || !parentTitle || !Array.isArray(subtasks)) {
    return NextResponse.json(
      { error: 'meetingId, parentTitle, subtasks are required' },
      { status: 400 }
    )
  }

  // 作成先ユーザー確定
  const targetUser = (ownerEmail || session.user.email) as string
  const teamUsers = getTeamTaskUsers()
  if (!teamUsers.includes(targetUser)) {
    return NextResponse.json(
      { error: `${targetUser} はチームのタスク管理対象ではありません` },
      { status: 400 }
    )
  }

  // Meeting 存在確認 + 二重登録チェック
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      date: true,
      minutesUrl: true,
      minutesTasksRegisteredAt: true,
      MeetingParticipant: {
        include: {
          Contact: { select: { id: true, name: true, company: true } },
        },
      },
    },
  })

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }

  // 二重登録防止
  if (meeting.minutesTasksRegisteredAt) {
    return NextResponse.json(
      {
        error: 'already_registered',
        registeredAt: meeting.minutesTasksRegisteredAt.toISOString(),
      },
      { status: 409 }
    )
  }

  try {
    const client = await getTasksClientForUser(targetUser)
    const taskListId = await getOrCreateCrmTaskListForUser(targetUser)

    // 顧客情報を notes に含める
    const participantNames = meeting.MeetingParticipant.map(
      (mp) => `${mp.Contact.name}${mp.Contact.company ? ` (${mp.Contact.company})` : ''}`
    ).join(', ')

    const meetingDateStr = new Date(meeting.date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    })

    const parentNotes = [
      participantNames ? `参加者: ${participantNames}` : '',
      meeting.minutesUrl ? `議事録: ${meeting.minutesUrl}` : '',
      `会議日: ${meetingDateStr}`,
    ]
      .filter(Boolean)
      .join('\n')

    // 親タスク作成
    const parentResult = await client.tasks.insert({
      tasklist: taskListId,
      requestBody: {
        title: parentTitle,
        notes: parentNotes || undefined,
        status: 'needsAction',
      },
    })

    const parentTaskId = parentResult.data.id!

    // サブタスクを順次作成（parent クエリパラメータで親を指定）
    const createdSubtasks: { id: string; title: string }[] = []
    for (const sub of subtasks) {
      const subResult = await client.tasks.insert({
        tasklist: taskListId,
        parent: parentTaskId,
        requestBody: {
          title: sub.title,
          notes: sub.detail || undefined,
          status: 'needsAction',
          due: sub.due ? new Date(sub.due).toISOString() : undefined,
        },
      })
      createdSubtasks.push({
        id: subResult.data.id!,
        title: subResult.data.title || sub.title,
      })
    }

    const registeredAt = new Date()

    // DB 更新: TaskLink 保存 + Meeting.minutesTasksRegisteredAt 更新
    await prisma.$transaction([
      prisma.taskLink.create({
        data: {
          id: crypto.randomUUID(),
          googleTaskId: parentTaskId,
          taskListId,
          contactId,
          presetLabel: 'minutes',
        },
      }),
      prisma.meeting.update({
        where: { id: meetingId },
        data: { minutesTasksRegisteredAt: registeredAt },
      }),
    ])

    return NextResponse.json({
      parentTask: {
        id: parentTaskId,
        title: parentResult.data.title,
      },
      subtasks: createdSubtasks,
      registeredAt: registeredAt.toISOString(),
    })
  } catch (err: unknown) {
    console.error('[from-minutes] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
