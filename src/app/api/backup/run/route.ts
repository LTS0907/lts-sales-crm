/**
 * /api/backup/run
 *
 * 全バックアップを実行（Sheets + GitHub + Cleanup）
 * Vercel Cron から daily で呼ばれる
 * Authorization: Bearer <CRON_API_SECRET> が必要
 */
import { NextResponse } from 'next/server'
import {
  backupToSheets, backupToGithub, cleanupOldBackups,
  notifyDiscord, saveBackupLog,
} from '@/lib/backup'

export const maxDuration = 60

export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = request.headers.get('Authorization')
  const expected = process.env.CRON_API_SECRET
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const results: {
    sheets?: Awaited<ReturnType<typeof backupToSheets>>
    github?: Awaited<ReturnType<typeof backupToGithub>>
    cleanup?: Awaited<ReturnType<typeof cleanupOldBackups>>
    errors: string[]
  } = { errors: [] }

  // L3: Google Sheets
  try {
    results.sheets = await backupToSheets()
    console.log('[backup] Sheets OK')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`sheets: ${msg}`)
    console.error('[backup] Sheets failed:', msg)
  }

  // L2: GitHub dump
  try {
    results.github = await backupToGithub()
    console.log('[backup] GitHub OK')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`github: ${msg}`)
    console.error('[backup] GitHub failed:', msg)
  }

  // Cleanup old dumps (> 30 days)
  try {
    results.cleanup = await cleanupOldBackups()
    if (results.cleanup.deleted.length > 0) {
      console.log(`[backup] Cleanup: deleted ${results.cleanup.deleted.length} old files`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`cleanup: ${msg}`)
    console.error('[backup] Cleanup failed:', msg)
  }

  const sheetsOk = !!results.sheets
  const githubOk = !!results.github
  const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' =
    results.errors.length === 0 ? 'SUCCESS' : (sheetsOk || githubOk) ? 'PARTIAL' : 'FAILED'
  const httpStatus = status === 'SUCCESS' ? 200 : status === 'PARTIAL' ? 207 : 500
  const durationMs = Date.now() - start

  // DB ログ保存
  await saveBackupLog({
    kind: 'BACKUP',
    status,
    sheetsOk,
    githubOk,
    driveDumpUrl: results.github?.url,
    tableCounts: results.sheets?.tables,
    errors: results.errors,
    durationMs,
  })

  // Discord 通知
  const totalRows = results.sheets?.tables
    ? Object.values(results.sheets.tables).reduce((a, b) => a + b, 0)
    : 0
  const tableCount = results.sheets?.tables ? Object.keys(results.sheets.tables).length : 0
  const summary = [
    `ステータス: **${status}**`,
    `Sheets: ${sheetsOk ? '✅' : '❌'}  GitHub: ${githubOk ? '✅' : '❌'}`,
    `レコード合計: ${totalRows.toLocaleString()} 行 (${tableCount} テーブル)`,
    results.github?.dailyPath ? `Daily: \`${results.github.dailyPath}\`` : '',
    results.github?.archivePath ? `Archive: \`${results.github.archivePath}\`` : '',
    results.cleanup && results.cleanup.deleted.length > 0
      ? `🧹 Cleanup: ${results.cleanup.deleted.length}件 削除`
      : '',
    results.errors.length > 0 ? `\n**エラー:**\n\`\`\`\n${results.errors.join('\n')}\n\`\`\`` : '',
    `経過時間: ${(durationMs / 1000).toFixed(1)}秒`,
  ].filter(Boolean).join('\n')

  await notifyDiscord(summary, status !== 'SUCCESS')

  return NextResponse.json({ ...results, status, durationMs }, { status: httpStatus })
}
