import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getFieldsConfig, saveFieldsConfig, getTemplatePdfBuffer, listTemplates } from '@/lib/contract'
import type { FieldsConfig } from '@/types/contract'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { name } = await params
  const templateName = decodeURIComponent(name)
  const config = getFieldsConfig(templateName)

  // Find the actual PDF file name
  const templates = listTemplates()
  const tmpl = templates.find(t => t.displayName === templateName)
  let pdfBase64 = ''
  if (tmpl) {
    try {
      const buf = getTemplatePdfBuffer(tmpl.fileName)
      pdfBase64 = buf.toString('base64')
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    config: config || { templateName, fields: [] },
    pdfBase64,
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { name } = await params
  const templateName = decodeURIComponent(name)
  const config: FieldsConfig = await request.json()
  saveFieldsConfig(templateName, config)

  return NextResponse.json({ success: true })
}
