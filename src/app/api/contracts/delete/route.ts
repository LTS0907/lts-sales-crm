import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { google } from 'googleapis'

async function deleteDriveFile(accessToken: string, fileId: string) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  await drive.files.delete({ fileId, supportsAllDrives: true })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { contractId } = await request.json()
    if (!contractId) {
      return NextResponse.json({ error: 'contractId is required' }, { status: 400 })
    }

    // Get contract to find Drive file IDs before deleting
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { driveFileId: true, signedDriveFileId: true, certDriveFileId: true },
    })

    // Delete Drive files (non-fatal)
    if (contract) {
      const fileIds = [
        contract.driveFileId,
        contract.signedDriveFileId,
        contract.certDriveFileId,
      ].filter(Boolean) as string[]

      for (const fileId of fileIds) {
        try {
          await deleteDriveFile(session.accessToken, fileId)
        } catch (err) {
          console.error(`Drive file delete failed (${fileId}):`, err)
        }
      }
    }

    await prisma.contract.delete({ where: { id: contractId } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Contract delete error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
