import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

const PARENT_FOLDER_ID = '1Z_tAkH5jEk5MVMGaajArqcLKI2dqbu40'

function getDriveClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth: oauth2Client })
}

// GET /api/drive?folderId=xxx — フォルダ内のファイル一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get('folderId')
  if (!folderId) {
    return NextResponse.json({ error: 'folderId is required' }, { status: 400 })
  }

  try {
    const drive = getDriveClient(session.accessToken)
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
      orderBy: 'modifiedTime desc',
    })
    return NextResponse.json({ files: res.data.files || [] })
  } catch (err: any) {
    console.error('Drive list error:', err)
    return NextResponse.json({ error: err.message || 'Drive error' }, { status: 500 })
  }
}

// POST /api/drive — 顧客用フォルダを作成してDBに保存
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { contactId } = await request.json()
  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  if (contact.driveFolderId) {
    return NextResponse.json({ folderId: contact.driveFolderId })
  }

  const folderName = `${contact.id}　${contact.company || contact.name}`

  try {
    const drive = getDriveClient(session.accessToken)
    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [PARENT_FOLDER_ID],
      },
      fields: 'id',
    })

    const folderId = res.data.id!
    await prisma.contact.update({ where: { id: contactId }, data: { driveFolderId: folderId } })
    return NextResponse.json({ folderId })
  } catch (err: any) {
    console.error('Drive create folder error:', err)
    return NextResponse.json({ error: err.message || 'Drive error' }, { status: 500 })
  }
}
