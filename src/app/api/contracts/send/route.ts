import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  getTemplatePdfBuffer,
  generateSigningToken,
  uploadToDrive,
} from '@/lib/contract'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { contactId, templateFileName } = await request.json()

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, company: true, driveFolderId: true },
    })
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    if (!contact.driveFolderId) return NextResponse.json({ error: 'Contact has no Drive folder' }, { status: 400 })

    // Get template PDF (no stamp — Google eSignature handles sender info)
    const pdfBuffer = getTemplatePdfBuffer(templateFileName)

    // Upload PDF to Drive
    const displayName = templateFileName.replace(/\.pdf$/, '').trim()
    const driveFileId = await uploadToDrive(
      session.accessToken,
      `${displayName}_${contact.name}.pdf`,
      pdfBuffer,
      contact.driveFolderId
    )

    // Create contract record
    const signingToken = generateSigningToken()
    await prisma.contract.create({
      data: {
        contactId: contact.id,
        templateName: templateFileName,
        signingToken,
        driveFileId,
        status: 'SENT',
      },
    })

    return NextResponse.json({
      success: true,
      driveFileId,
    })
  } catch (error: unknown) {
    console.error('Contract create error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
