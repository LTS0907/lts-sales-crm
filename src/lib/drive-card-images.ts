/**
 * 名刺画像をGoogle Driveの「名刺画像」フォルダに保存するヘルパー。
 *
 * 仕様:
 *   - 共通フォルダ「名刺画像」配下にフラットに保存
 *   - フォルダID は env CARD_IMAGES_FOLDER_ID で指定。未指定なら自動作成（初回のみ）
 *   - ファイル名: {contactId}_{front|back}_{timestamp}.{ext}
 *   - Drive リンク (webContentLink) を返す
 */
import { google } from 'googleapis'
import { Readable } from 'node:stream'

const FOLDER_NAME = '名刺画像'

let cachedFolderId: string | null = null

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

async function findOrCreateFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId
  const envId = process.env.CARD_IMAGES_FOLDER_ID
  if (envId) {
    cachedFolderId = envId
    return envId
  }

  const drive = getDriveClient(accessToken)
  const search = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  })
  const found = search.data.files?.[0]
  if (found?.id) {
    cachedFolderId = found.id
    return found.id
  }

  const created = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })
  if (!created.data.id) throw new Error('failed to create card images folder')
  cachedFolderId = created.data.id
  return created.data.id
}

function pickExtension(mimeType?: string): string {
  if (!mimeType) return 'jpg'
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg').replace('+xml', '')
  return ext && ext.length <= 5 ? ext : 'jpg'
}

/**
 * 画像 Buffer を Drive にアップロードして、共有可能なURLを返す。
 * 失敗時は null を返す（保存失敗で名刺登録自体を止めないため）。
 */
export async function uploadCardImage(params: {
  accessToken: string
  contactId: string
  side: 'front' | 'back'
  data: Buffer
  mimeType?: string
}): Promise<string | null> {
  const { accessToken, contactId, side, data, mimeType } = params
  try {
    const folderId = await findOrCreateFolder(accessToken)
    const drive = getDriveClient(accessToken)
    const filename = `${contactId}_${side}_${Date.now()}.${pickExtension(mimeType)}`

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || 'image/jpeg',
        body: Readable.from(data),
      },
      fields: 'id, webViewLink, webContentLink',
    })

    const fileId = res.data.id
    if (!fileId) return null

    // ドメイン内の閲覧者は見られるように共有設定（個別共有失敗を許容）
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'domain',
          domain: 'life-time-support.com',
        },
      })
    } catch {
      // 共有失敗してもファイル自体は保存されているので無視
    }

    // webViewLink (lh3.googleusercontent.com の直接リンクが取れない場合のフォールバック)
    return res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
  } catch (err) {
    console.error('[drive-card-images] upload failed:', err)
    return null
  }
}
