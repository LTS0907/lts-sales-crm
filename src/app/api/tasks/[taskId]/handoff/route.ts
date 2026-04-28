/**
 * POST /api/tasks/[taskId]/handoff
 *
 * タスクを別のチームメンバーに引き渡す。
 *   1. fromEmail のタスクを取得（タイトル・メモ・期限を保持）
 *   2. toEmail の CRM リストに同じ内容で新規作成
 *   3. 元タスクを削除
 *   4. グループ Chat スペースに通知メッセージを送信
 *
 * body: { fromEmail, toEmail, taskListId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import {
  getTasksClientForUser,
  getOrCreateCrmTaskListForUser,
  getTeamTaskUsers,
  getTaskOwnerName,
} from '@/lib/google-tasks-sa'
import { clearCached, tokenKey } from '@/lib/tasks-cache'
import { sendChatToSpace } from '@/lib/chat-sender'

const CACHE_KEY_TEAM = 'team-tasks'
const SENDER_EMAIL = 'cs@life-time-support.com'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const body = await req.json()
  const { fromEmail, toEmail, taskListId } = body

  if (!fromEmail || !toEmail || !taskListId) {
    return NextResponse.json(
      { error: 'fromEmail, toEmail, taskListId は必須です' },
      { status: 400 }
    )
  }

  const teamUsers = getTeamTaskUsers()
  if (!teamUsers.includes(fromEmail) || !teamUsers.includes(toEmail)) {
    return NextResponse.json(
      { error: '指定されたメンバーはチーム外です' },
      { status: 400 }
    )
  }

  if (fromEmail === toEmail) {
    return NextResponse.json({ error: '同じメンバーには渡せません' }, { status: 400 })
  }

  try {
    // 1. 元タスクを取得
    const fromClient = await getTasksClientForUser(fromEmail)
    const original = await fromClient.tasks.get({ tasklist: taskListId, task: taskId })
    const orig = original.data

    // 2. toEmail の CRM リストに新規作成
    const toClient = await getTasksClientForUser(toEmail)
    const toListId = await getOrCreateCrmTaskListForUser(toEmail)
    const handoffNote = `【${getTaskOwnerName(fromEmail)} から引き継ぎ】\n${orig.notes || ''}`.trim()
    const created = await toClient.tasks.insert({
      tasklist: toListId,
      requestBody: {
        title: orig.title,
        notes: handoffNote || undefined,
        status: 'needsAction',
        due: orig.due || undefined,
      },
    })

    // 3. 元タスクを削除
    await fromClient.tasks.delete({ tasklist: taskListId, task: taskId })

    // 4. キャッシュ破棄
    clearCached(tokenKey(CACHE_KEY_TEAM))

    // 5. Chat 通知（失敗しても本処理は成功扱い）
    try {
      const senderName = session.user.name || session.user.email
      const message = [
        '🔁 *タスク引き渡し*',
        '',
        `📋 タスク: ${orig.title || '(タイトルなし)'}`,
        `📤 ${getTaskOwnerName(fromEmail)} → 📥 ${getTaskOwnerName(toEmail)}`,
        `👤 操作者: ${senderName}`,
        orig.due ? `📅 期限: ${new Date(orig.due).toLocaleDateString('ja-JP')}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      await sendChatToSpace({
        senderEmail: SENDER_EMAIL,
        text: message,
      })
    } catch (chatErr) {
      console.error('[handoff] chat notification failed:', chatErr)
    }

    return NextResponse.json({
      ok: true,
      newTaskId: created.data.id,
      newTaskListId: toListId,
      from: fromEmail,
      to: toEmail,
    })
  } catch (err: unknown) {
    console.error('Tasks handoff error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'タスク引き渡しに失敗' },
      { status: 500 }
    )
  }
}
