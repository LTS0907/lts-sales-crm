/**
 * meet-transcript-sync.ts
 *
 * Google Meet が生成した議事録 (transcript) を
 * Drive から取得 → Meetingに紐付け → AI要約 → Note/Task を作成する処理の中核ロジック。
 *
 * Google Meet Recording/Transcript の挙動:
 * - 会議終了後、通常10〜60分で Drive の「Meet Recordings」フォルダにファイル生成
 * - ファイル名パターン例: "2026-04-17 - 営業部会議 (yyyy-mm-dd hh:mm GMT+9) - Transcript"
 * - MIME type: application/vnd.google-apps.document (Google Docs)
 * - 録画: MIME type: video/mp4
 */
import { google, drive_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from './prisma'
import { analyzeMeetingTranscript } from './gemini-meeting'
import { getTasksClient, getOrCreateCrmTaskList } from './google-tasks'

const MEET_RECORDINGS_FOLDER_QUERY = "name = 'Meet Recordings' and mimeType = 'application/vnd.google-apps.folder'"
const TRANSCRIPT_MIME = 'application/vnd.google-apps.document'

export interface SyncResult {
  processedMeetings: number
  newTranscripts: number
  tasksCreated: number
  errors: Array<{ meetingId?: string; error: string }>
}

/**
 * Meet Recordings フォルダ内の未同期 transcript を処理する
 *
 * @param accessToken Google OAuth access token（書き込み権限: drive, tasks）
 */
export async function syncMeetRecordings(accessToken: string): Promise<SyncResult> {
  const result: SyncResult = {
    processedMeetings: 0,
    newTranscripts: 0,
    tasksCreated: 0,
    errors: [],
  }

  const oauth2 = new google.auth.OAuth2()
  oauth2.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth: oauth2 })

  // 1. Meet Recordings フォルダ ID を取得
  const folderRes = await drive.files.list({
    q: MEET_RECORDINGS_FOLDER_QUERY,
    fields: 'files(id, name)',
    pageSize: 5,
  })
  const meetFolder = folderRes.data.files?.[0]
  if (!meetFolder?.id) {
    result.errors.push({ error: 'Drive に Meet Recordings フォルダが見つかりません' })
    return result
  }

  // 2. フォルダ内の transcript (Google Docs) 一覧を取得
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const listRes = await drive.files.list({
    q: `'${meetFolder.id}' in parents and mimeType = '${TRANSCRIPT_MIME}' and modifiedTime > '${last30Days}'`,
    fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
    orderBy: 'createdTime desc',
    pageSize: 50,
  })
  const transcripts = listRes.data.files || []

  // 3. 同期候補の Meeting を取得（SCHEDULED/COMPLETED で syncedAt が空のもの、過去30日以内）
  const meetings = await prisma.meeting.findMany({
    where: {
      syncedAt: null,
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      googleEventId: { not: null },
    },
    include: { MeetingParticipant: { include: { Contact: true } } },
    orderBy: { date: 'desc' },
  })

  // 4. 各Meetingに対して、transcriptをマッチング
  for (const meeting of meetings) {
    try {
      const matched = findMatchingTranscript(transcripts, meeting)
      if (!matched?.id) continue

      // 既に処理済みかチェック
      if (meeting.transcriptDriveId === matched.id) continue

      result.newTranscripts++

      // 5. Transcript 本文を取得
      const transcriptText = await fetchDocumentText(drive, matched.id)

      // 6. Gemini で分析
      const participants = meeting.MeetingParticipant.map(p => p.Contact.name)
      const analysis = await analyzeMeetingTranscript(transcriptText, {
        title: meeting.title || undefined,
        participants,
        date: meeting.date.toISOString().slice(0, 10),
      })

      // 7. Note をContactごとに作成（要約）
      for (const p of meeting.MeetingParticipant) {
        await prisma.note.create({
          data: {
            id: crypto.randomUUID(),
            contactId: p.contactId,
            updatedAt: new Date(),
            category: 'MEETING',
            content: formatMeetingNote(meeting, analysis, matched.webViewLink),
          },
        })
      }

      // 8. お客様のDriveフォルダにtranscriptコピー
      await copyTranscriptToContactFolders(drive, matched.id, meeting.MeetingParticipant)

      // 9. Google Tasks にネクストアクションを追加
      if (analysis.nextActions.length > 0) {
        const tasksClient = getTasksClient(accessToken)
        const crmListId = await getOrCreateCrmTaskList(tasksClient)

        for (const action of analysis.nextActions) {
          await tasksClient.tasks.insert({
            tasklist: crmListId,
            requestBody: {
              title: action.relatedContact
                ? `[${action.relatedContact}] ${action.task}`
                : action.task,
              notes: [
                `📅 打ち合わせ: ${meeting.title}`,
                action.assignee ? `👤 担当: ${action.assignee}` : '',
                action.priority ? `🎯 優先度: ${action.priority}` : '',
                '',
                `🔗 議事録: ${matched.webViewLink || ''}`,
              ].filter(Boolean).join('\n'),
              due: action.dueDate ? new Date(action.dueDate).toISOString() : undefined,
            },
          })
          result.tasksCreated++
        }
      }

      // 10. Meeting レコードを更新
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          transcriptDriveId: matched.id,
          summary: analysis.summary,
          summaryAt: new Date(),
          syncedAt: new Date(),
          status: 'COMPLETED',
        },
      })

      result.processedMeetings++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      console.error(`[meet-sync] Meeting ${meeting.id} failed:`, msg)
      result.errors.push({ meetingId: meeting.id, error: msg })
    }
  }

  return result
}

/**
 * 議事録ファイル名から対応するMeetingを特定
 *
 * Meet の transcript ファイル名フォーマット:
 *   "{meeting title} ({YYYY-MM-DD HH:MM GMT+9}) - Transcript"
 */
function findMatchingTranscript(
  transcripts: drive_v3.Schema$File[],
  meeting: { title?: string | null; date: Date; googleEventId?: string | null }
): drive_v3.Schema$File | null {
  const meetingTitle = (meeting.title || '').toLowerCase().trim()
  const meetingDateStr = meeting.date.toISOString().slice(0, 10)

  for (const t of transcripts) {
    const name = (t.name || '').toLowerCase()

    // タイトル一致 + 日付近似（±1日）
    if (meetingTitle && name.includes(meetingTitle)) {
      const createdTime = t.createdTime ? new Date(t.createdTime) : null
      if (createdTime) {
        const diff = Math.abs(createdTime.getTime() - meeting.date.getTime())
        if (diff < 3 * 24 * 60 * 60 * 1000) {
          // 3日以内なら採用
          return t
        }
      }
    }

    // 日付だけでもマッチする場合
    if (name.includes(meetingDateStr) && name.includes('transcript')) {
      return t
    }
  }

  return null
}

/**
 * Google Docs の本文をプレーンテキストで取得
 */
async function fetchDocumentText(drive: drive_v3.Drive, docId: string): Promise<string> {
  const res = await drive.files.export({
    fileId: docId,
    mimeType: 'text/plain',
  }, { responseType: 'text' })
  return res.data as unknown as string
}

/**
 * 各Contact の driveFolderId に transcript をコピー
 */
async function copyTranscriptToContactFolders(
  drive: drive_v3.Drive,
  transcriptId: string,
  participants: Array<{ Contact: { id: string; name: string; driveFolderId: string | null } }>
): Promise<void> {
  for (const p of participants) {
    if (!p.Contact.driveFolderId) continue
    try {
      await drive.files.copy({
        fileId: transcriptId,
        requestBody: {
          parents: [p.Contact.driveFolderId],
          name: `議事録_${new Date().toISOString().slice(0, 10)}_${p.Contact.name}`,
        },
      })
    } catch (e) {
      console.warn(`Drive copy failed for contact ${p.Contact.id}:`, e)
    }
  }
}

/**
 * 打ち合わせ議事録Noteのフォーマット
 */
function formatMeetingNote(
  meeting: { title?: string | null; date: Date },
  analysis: Awaited<ReturnType<typeof analyzeMeetingTranscript>>,
  transcriptUrl?: string | null
): string {
  const lines: string[] = []
  lines.push(`## 📅 ${meeting.title || '打ち合わせ'} (${meeting.date.toISOString().slice(0, 10)})`)
  lines.push('')
  lines.push('### 要約')
  lines.push(analysis.summary)
  lines.push('')

  if (analysis.keyDecisions.length > 0) {
    lines.push('### 決定事項')
    for (const d of analysis.keyDecisions) {
      lines.push(`- ${d}`)
    }
    lines.push('')
  }

  if (analysis.nextActions.length > 0) {
    lines.push('### ネクストアクション')
    for (const a of analysis.nextActions) {
      const parts = [a.task]
      if (a.assignee) parts.push(`(担当: ${a.assignee})`)
      if (a.dueDate) parts.push(`期日: ${a.dueDate}`)
      if (a.priority) parts.push(`[${a.priority}]`)
      lines.push(`- ${parts.join(' ')}`)
    }
    lines.push('')
  }

  if (transcriptUrl) {
    lines.push(`🔗 [議事録を開く](${transcriptUrl})`)
  }

  return lines.join('\n')
}
