import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { listTemplates, saveTemplatePdf } from '@/lib/contract'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  return NextResponse.json({ templates: listTemplates() })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || !file.name.endsWith('.pdf')) {
    return NextResponse.json({ error: 'PDF file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  saveTemplatePdf(file.name, buffer)

  return NextResponse.json({ success: true, fileName: file.name })
}
