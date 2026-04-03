import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  getTemplatePdfBuffer,
  getFieldsConfig,
  generateSigningToken,
  uploadToDrive,
  sendContractEmail,
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
      select: { id: true, name: true, company: true, email: true, driveFolderId: true },
    })
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    if (!contact.email) return NextResponse.json({ error: 'Contact has no email' }, { status: 400 })

    // Get template
    const pdfBuffer = getTemplatePdfBuffer(templateFileName)
    const fieldsConfig = getFieldsConfig(templateFileName)
    if (!fieldsConfig || fieldsConfig.fields.length === 0) {
      return NextResponse.json({ error: 'Template has no field definitions. Please set up fields first.' }, { status: 400 })
    }

    // Upload PDF to Drive (if contact has a folder)
    let driveFileId: string | null = null
    if (contact.driveFolderId) {
      const displayName = templateFileName.replace(/\.pdf$/, '').trim()
      driveFileId = await uploadToDrive(
        session.accessToken,
        `${displayName}_${contact.name}.pdf`,
        pdfBuffer,
        contact.driveFolderId
      )
    }

    // Create signing token and contract record
    const signingToken = generateSigningToken()
    const contract = await prisma.contract.create({
      data: {
        contactId: contact.id,
        templateName: templateFileName,
        signingToken,
        driveFileId,
        status: 'SENT',
      },
    })

    // Determine signing URL
    const baseUrl = process.env.NEXTAUTH_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'
    const signingUrl = `${baseUrl}/sign/${signingToken}`

    // Send email
    const displayName = templateFileName.replace(/\.pdf$/, '').trim()
    await sendContractEmail(
      session.accessToken,
      contact.email,
      contact.name,
      displayName,
      signingUrl
    )

    return NextResponse.json({
      success: true,
      contractId: contract.id,
      signingUrl,
    })
  } catch (error: unknown) {
    console.error('Contract send error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
