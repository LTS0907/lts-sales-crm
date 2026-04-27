import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getTasksClientForUser, getTeamTaskUsers } from '@/lib/google-tasks-sa'
import { clearCached, tokenKey } from '@/lib/tasks-cache'

const CACHE_KEY_TEAM = 'team-tasks'

// POST /api/tasks/reorder
// body: { taskId, taskListId, previousTaskId?, ownerEmail? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId, taskListId, previousTaskId, ownerEmail } = await req.json()

  if (!taskId || !taskListId) {
    return NextResponse.json({ error: 'taskId and taskListId are required' }, { status: 400 })
  }

  const targetUser = ownerEmail || session.user.email
  const teamUsers = getTeamTaskUsers()
  if (!teamUsers.includes(targetUser)) {
    return NextResponse.json(
      { error: `${targetUser} はチームのタスク管理対象ではありません` },
      { status: 400 }
    )
  }

  try {
    const client = await getTasksClientForUser(targetUser)

    const res = await client.tasks.move({
      tasklist: taskListId,
      task: taskId,
      previous: previousTaskId || undefined,
    })

    clearCached(tokenKey(CACHE_KEY_TEAM))

    return NextResponse.json({
      id: res.data.id,
      position: res.data.position,
    })
  } catch (err: unknown) {
    console.error('Tasks reorder error:', (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.data || (err as Error).message || err)
    return NextResponse.json(
      { error: (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.data?.error?.message || (err as Error).message || '並べ替えに失敗' },
      { status: (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response?.status || 500 }
    )
  }
}
