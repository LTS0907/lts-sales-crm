import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTemplatePdfBuffer, getFieldsConfig, resolvePrefill } from '@/lib/contract'
import type { SigningData } from '@/types/contract'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const contract = await prisma.contract.findUnique({
      where: { signingToken: token },
      include: {
        Contact: { select: { name: true, company: true, email: true } },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    if (contract.status === 'SIGNED') {
      return NextResponse.json({ error: 'Already signed', signedAt: contract.signedAt }, { status: 410 })
    }

    // Mark as viewed
    if (contract.status === 'SENT') {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: 'VIEWED', viewedAt: new Date() },
      })
    }

    // Load template PDF and fields
    const pdfBuffer = getTemplatePdfBuffer(contract.templateName)
    const fieldsConfig = getFieldsConfig(contract.templateName)
    const fields = fieldsConfig?.fields || []

    // Resolve prefill values
    const prefillValues = resolvePrefill(fields, {
      name: contract.Contact.name,
      company: contract.Contact.company,
      email: contract.Contact.email,
    })

    const data: SigningData = {
      contractId: contract.id,
      templateName: contract.templateName.replace(/\.pdf$/, '').trim(),
      contactName: contract.Contact.name,
      contactCompany: contract.Contact.company,
      fields,
      prefillValues,
      pdfBase64: pdfBuffer.toString('base64'),
      status: 'VIEWED',
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Signing data error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
