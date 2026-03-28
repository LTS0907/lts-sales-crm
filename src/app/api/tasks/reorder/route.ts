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
import { getTasksClient } from '@/lib/google-tasks'

// POST /api/tasks/reorder — Google Tasks の move API でタスク順序を変更
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId, taskListId, previousTaskId } = await req.json()

  if (!taskId || !taskListId) {
    return NextResponse.json({ error: 'taskId and taskListId are required' }, { status: 400 })
  }

  try {
    const client = getTasksClient(session.accessToken)

    const res = await client.tasks.move({
      tasklist: taskListId,
      task: taskId,
      previous: previousTaskId || undefined,
    })

    return NextResponse.json({
      id: res.data.id,
      position: res.data.position,
    })
  } catch (err: any) {
    console.error('Tasks reorder error:', err?.response?.data || err.message || err)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err.message || '並べ替えに失敗' },
      { status: err?.response?.status || 500 }
    )
  }
}
