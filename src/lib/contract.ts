import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { PDFDocument } from 'pdf-lib'
import { google } from 'googleapis'
import { Readable } from 'stream'
import type { FieldsConfig, ContractTemplate, ContractField } from '@/types/contract'

const CONTRACTS_DIR = path.join(process.cwd(), 'contexts', 'data', 'contract')

// ── Template Management ──

export function listTemplates(): ContractTemplate[] {
  if (!fs.existsSync(CONTRACTS_DIR)) return []
  const files = fs.readdirSync(CONTRACTS_DIR)
  const pdfs = files.filter(f => f.endsWith('.pdf'))

  return pdfs.map(pdf => {
    const baseName = pdf.replace(/\.pdf$/, '').trim()
    const fieldsFile = files.find(f => f.startsWith(baseName) && f.endsWith('.fields.json'))
    let fieldCount = 0
    if (fieldsFile) {
      try {
        const config: FieldsConfig = JSON.parse(
          fs.readFileSync(path.join(CONTRACTS_DIR, fieldsFile), 'utf8')
        )
        fieldCount = config.fields.length
      } catch { /* ignore */ }
    }
    return {
      fileName: pdf,
      displayName: baseName,
      hasFields: !!fieldsFile,
      fieldCount,
    }
  })
}

export function getTemplatePdfBuffer(fileName: string): Buffer {
  const filePath = path.join(CONTRACTS_DIR, fileName)
  if (!fs.existsSync(filePath)) throw new Error(`Template not found: ${fileName}`)
  return fs.readFileSync(filePath)
}

export function getFieldsConfig(templateName: string): FieldsConfig | null {
  const baseName = templateName.replace(/\.pdf$/, '').trim()
  const dir = fs.readdirSync(CONTRACTS_DIR)
  const fieldsFile = dir.find(f => f.startsWith(baseName) && f.endsWith('.fields.json'))
  if (!fieldsFile) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, fieldsFile), 'utf8'))
  } catch {
    return null
  }
}

export function saveFieldsConfig(templateName: string, config: FieldsConfig): void {
  const baseName = templateName.replace(/\.pdf$/, '').trim()
  const filePath = path.join(CONTRACTS_DIR, `${baseName}.fields.json`)
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
}

export function saveTemplatePdf(fileName: string, buffer: Buffer): void {
  const filePath = path.join(CONTRACTS_DIR, fileName)
  fs.writeFileSync(filePath, buffer)
}

// ── Token Generation ──

export function generateSigningToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// ── Prefill Resolution ──

export function resolvePrefill(
  fields: ContractField[],
  contact: { name: string; company: string | null; email: string | null }
): Record<string, string> {
  const now = new Date()
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
  const map: Record<string, string> = {}

  for (const field of fields) {
    if (!field.prefill) continue
    switch (field.prefill) {
      case '{{company}}': map[field.id] = contact.company || ''; break
      case '{{name}}':    map[field.id] = contact.name || ''; break
      case '{{email}}':   map[field.id] = contact.email || ''; break
      case '{{date}}':    map[field.id] = dateStr; break
    }
  }
  return map
}

// ── PDF Building (embed signed fields) ──

export async function buildSignedPdf(
  templateBuffer: Buffer,
  fields: ContractField[],
  fieldValues: Record<string, string>,
  fontBytes: Buffer
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(templateBuffer)
  const customFont = await pdfDoc.embedFont(fontBytes)

  for (const field of fields) {
    const value = fieldValues[field.id]
    if (!value) continue

    const page = pdfDoc.getPage(field.page)
    const { width: pageW, height: pageH } = page.getSize()
    const pdfX = (field.x / 100) * pageW
    const pdfY = pageH - ((field.y / 100) * pageH) - ((field.height / 100) * pageH)
    const pdfWidth = (field.width / 100) * pageW
    const pdfHeight = (field.height / 100) * pageH

    if (field.type === 'SIGNATURE') {
      // value is base64 PNG data URL
      const base64 = value.split(',')[1]
      if (!base64) continue
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const img = await pdfDoc.embedPng(imgBytes)
      page.drawImage(img, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight })
    } else if (field.type === 'SIGNER_TEXT' || field.type === 'DATE') {
      const fontSize = Math.min(pdfHeight * 0.7, 12)
      page.drawText(value, {
        x: pdfX + 2,
        y: pdfY + (pdfHeight - fontSize) / 2,
        size: fontSize,
        font: customFont,
      })
    } else if (field.type === 'CHECKBOX' && value === 'true') {
      const fontSize = Math.min(pdfHeight * 0.8, 14)
      page.drawText('✓', {
        x: pdfX + (pdfWidth - fontSize) / 2,
        y: pdfY + (pdfHeight - fontSize) / 2,
        size: fontSize,
        font: customFont,
      })
    }
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

// ── Google Drive Upload ──

export async function uploadToDrive(
  accessToken: string,
  fileName: string,
  buffer: Buffer,
  folderId: string,
  mimeType = 'application/pdf'
): Promise<string> {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
    supportsAllDrives: true,
  })

  return res.data.id!
}

// ── Email Sending ──

function createContractEmail(
  to: string,
  from: string,
  contactName: string,
  templateName: string,
  signingUrl: string
): string {
  const subject = `【電子契約書】${templateName} — 株式会社ライフタイムサポート`
  const body = [
    `${contactName} 様`,
    '',
    'いつもお世話になっております。',
    '株式会社ライフタイムサポートの龍竹です。',
    '',
    `「${templateName}」の契約書をお送りいたします。`,
    '',
    '下記リンクより内容をご確認いただき、電子署名をお願いいたします。',
    '',
    `▼ 契約書の確認・署名はこちら`,
    signingUrl,
    '',
    'ご不明な点がございましたら、お気軽にお問い合わせください。',
    '',
    '龍竹一生',
    '株式会社ライフタイムサポート',
    'TEL: 070-1298-0180',
  ].join('\n')

  const boundary = 'boundary_' + Date.now().toString(16)
  const emailLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    '',
    `--${boundary}--`,
  ]
  return emailLines.join('\r\n')
}

export async function sendContractEmail(
  accessToken: string,
  to: string,
  contactName: string,
  templateName: string,
  signingUrl: string
): Promise<void> {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const profile = await gmail.users.getProfile({ userId: 'me' })
  const from = profile.data.emailAddress || ''

  const raw = createContractEmail(to, from, contactName, templateName, signingUrl)
  const encoded = Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } })
}
