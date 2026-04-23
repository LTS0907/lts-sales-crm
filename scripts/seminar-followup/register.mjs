/**
 * register.mjs — セミナー参加者を CRM に登録 + Claude生成メールをドラフト保存
 *
 * 使い方:
 *   cd /Users/apple/scripts/lts-sales-crm
 *   node scripts/seminar-followup/register.mjs scripts/seminar-followup/drafts/<ファイル>.json
 *
 * 入力JSON:
 *   {
 *     "contact": {
 *       "name": "小澤賀宣",
 *       "company": "株式会社NKサービス",
 *       "title": "代表取締役",
 *       "department": "",
 *       "email": "lifetime150@gmail.com",
 *       "episodeMemo": "..."
 *     },
 *     "connectionType": "セミナー参加(4/17リフォームAI活用講座)",
 *     "email": {
 *       "subject": "...",
 *       "body": "..."
 *     }
 *   }
 *
 * 動作:
 *   1. メアドで既存 Contact を検索
 *   2. 無ければ新規作成、有れば更新（episodeMemo/email内容を上書き）
 *   3. emailStatus=DRAFTED / emailSubject / emailBody を保存
 *   4. 会社名と一致する Group があれば自動で所属させる（無ければスキップ）
 *   5. 作成/更新した contactId を stdout に出力
 */
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('使い方: node scripts/seminar-followup/register.mjs <input.json>')
    process.exit(1)
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
  const { contact: c, email: e, connectionType } = input

  if (!c?.name || !c?.email) {
    console.error('contact.name と contact.email は必須です')
    process.exit(1)
  }

  // 既存検索（メアド完全一致）
  const existing = await prisma.contact.findFirst({ where: { email: c.email } })

  let contact
  if (existing) {
    console.log(`[update] 既存 Contact を更新: id=${existing.id} (${existing.name})`)
    contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        updatedAt: new Date(),
        name: c.name,
        company: c.company || existing.company,
        title: c.title || existing.title,
        department: c.department || existing.department,
        episodeMemo: c.episodeMemo || existing.episodeMemo,
        connectionType: connectionType || existing.connectionType,
        emailSubject: e.subject,
        emailBody: e.body,
        emailStatus: 'DRAFTED',
      },
    })
  } else {
    const id = crypto.randomUUID()
    console.log(`[create] 新規 Contact を作成: id=${id}`)
    contact = await prisma.contact.create({
      data: {
        id,
        updatedAt: new Date(),
        name: c.name,
        company: c.company || null,
        title: c.title || null,
        department: c.department || null,
        email: c.email,
        episodeMemo: c.episodeMemo || null,
        connectionType: connectionType || null,
        emailSubject: e.subject,
        emailBody: e.body,
        emailStatus: 'DRAFTED',
        owner: 'KAZUI',
        salesPhase: 'LEAD',
      },
    })
  }

  // 同名の COMPANY グループがあれば所属させる
  if (contact.company) {
    const group = await prisma.group.findFirst({
      where: { name: contact.company, type: 'COMPANY' },
    })
    if (group) {
      const exists = await prisma.groupMember.findUnique({
        where: { groupId_contactId: { groupId: group.id, contactId: contact.id } },
      }).catch(() => null)
      if (!exists) {
        await prisma.groupMember.create({
          data: { groupId: group.id, contactId: contact.id },
        })
        console.log(`[group] 既存グループ「${group.name}」に追加`)
      }
    }
  }

  console.log('\n====== 登録結果 ======')
  console.log(`contactId   : ${contact.id}`)
  console.log(`name        : ${contact.name}`)
  console.log(`company     : ${contact.company}`)
  console.log(`title       : ${contact.title}`)
  console.log(`email       : ${contact.email}`)
  console.log(`emailStatus : ${contact.emailStatus}`)
  console.log(`subject     : ${contact.emailSubject}`)
  console.log(`body length : ${contact.emailBody?.length} chars`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
