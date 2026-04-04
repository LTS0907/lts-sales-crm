import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getTemplatePdfBuffer, getFieldsConfig, buildSignedPdf, uploadToDrive, hashBuffer, buildCertificatePdf } from '@/lib/contract'
import { getAccessToken } from '@/lib/google-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const { fieldValues } = await request.json()

    const contract = await prisma.contract.findUnique({
      where: { signingToken: token },
      include: {
        Contact: { select: { name: true, company: true, email: true, driveFolderId: true } },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    if (contract.status === 'SIGNED') {
      return NextResponse.json({ error: 'Already signed' }, { status: 410 })
    }

    // Load template and fields
    const pdfBuffer = getTemplatePdfBuffer(contract.templateName)
    const fieldsConfig = getFieldsConfig(contract.templateName)
    const fields = fieldsConfig?.fields || []

    // Load Japanese font
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf')
    let fontBytes: Buffer
    if (fs.existsSync(fontPath)) {
      fontBytes = fs.readFileSync(fontPath)
    } else {
      // Fallback: skip text embedding if font is missing
      console.warn('NotoSansJP font not found, text fields will not be embedded')
      fontBytes = Buffer.alloc(0)
    }

    // Build signed PDF
    let signedPdfBuffer: Buffer
    try {
      signedPdfBuffer = await buildSignedPdf(pdfBuffer, fields, fieldValues, fontBytes)
    } catch (err) {
      console.error('PDF build error:', err)
      return NextResponse.json({ error: 'Failed to build signed PDF' }, { status: 500 })
    }

    // Compute signed PDF hash
    const signedPdfHash = hashBuffer(signedPdfBuffer)

    // Get signer IP and UA
    const signerIp = request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || null
    const signerUserAgent = request.headers.get('user-agent') || null

    // Upload signed PDF to Drive
    let signedDriveFileId: string | null = null
    let certDriveFileId: string | null = null
    let accessToken: string | null = null

    if (contract.Contact.driveFolderId) {
      try {
        accessToken = await getAccessToken()
        const displayName = contract.templateName.replace(/\.pdf$/, '').trim()
        signedDriveFileId = await uploadToDrive(
          accessToken,
          `${displayName}_${contract.Contact.name}_署名済み.pdf`,
          signedPdfBuffer,
          contract.Contact.driveFolderId
        )
      } catch (err) {
        console.error('Drive upload error (non-fatal):', err)
      }
    }

    // Build and upload certificate PDF
    const signedAt = new Date()
    try {
      const certPdfBuffer = await buildCertificatePdf({
        contractId: contract.id,
        templateName: contract.templateName,
        signedPdfHash,
        contact: {
          name: contract.Contact.name,
          company: contract.Contact.company,
          email: contract.Contact.email,
        },
        sentAt: contract.sentAt,
        viewedAt: contract.viewedAt,
        signedAt,
        viewerIp: contract.viewerIp,
        signerIp,
        signerUserAgent,
        fontBytes,
      })

      if (contract.Contact.driveFolderId) {
        if (!accessToken) {
          try { accessToken = await getAccessToken() } catch { /* skip */ }
        }
        if (accessToken) {
          const displayName = contract.templateName.replace(/\.pdf$/, '').trim()
          certDriveFileId = await uploadToDrive(
            accessToken,
            `${displayName}_${contract.Contact.name}_署名証明書.pdf`,
            certPdfBuffer,
            contract.Contact.driveFolderId
          )
        }
      }
    } catch (err) {
      console.error('Certificate PDF error (non-fatal):', err)
    }

    // Update contract
    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: 'SIGNED',
        signedAt,
        signedDriveFileId,
        fieldValues,
        signerIp,
        signerUserAgent,
        signedPdfHash,
        certDriveFileId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Sign error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
