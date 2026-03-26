/* ************************************************************************** */
/*                                                                            */
/*    update-card-images.mjs                            :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
/**
 * CSVの ファイルURL 列を使って既存コンタクトに名刺画像URLを設定するスクリプト
 * 使い方: node scripts/update-card-images.mjs <csvファイルパス>
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import { parse } from 'csv-parse/sync'

const prisma = new PrismaClient()

function extractDriveFileId(url) {
  if (!url || !url.startsWith('http')) return null
  const m = url.match(/\/d\/([^/\?]+)/)
  return m ? m[1] : null
}

function toThumbnailUrl(driveUrl) {
  const fileId = extractDriveFileId(driveUrl)
  if (!fileId) return null
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
}

async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: node scripts/update-card-images.mjs <csvファイルパス>')
    process.exit(1)
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  })

  console.log(`📋 ${records.length} 件を処理します...`)

  let updated = 0
  let notFound = 0
  let noImage = 0

  for (const row of records) {
    const name = (row['氏名'] || '').trim()
    if (!name) continue

    const fileUrl = (row['ファイルURL'] || '').trim()
    const thumbnailUrl = toThumbnailUrl(fileUrl)

    if (!thumbnailUrl) {
      noImage++
      continue
    }

    // 氏名と会社名で検索
    const company = (row['会社名'] || '').trim() || undefined
    const contact = await prisma.contact.findFirst({
      where: {
        name,
        ...(company ? { company } : {}),
      },
    })

    if (!contact) {
      // 会社名なしで再検索
      const contactByNameOnly = await prisma.contact.findFirst({ where: { name } })
      if (!contactByNameOnly) {
        notFound++
        continue
      }
      await prisma.contact.update({
        where: { id: contactByNameOnly.id },
        data: { cardImageUrl: thumbnailUrl },
      })
    } else {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { cardImageUrl: thumbnailUrl },
      })
    }

    updated++
  }

  console.log(`\n✅ 完了`)
  console.log(`  更新: ${updated} 件`)
  console.log(`  ファイルURLなし: ${noImage} 件`)
  console.log(`  コンタクト未発見: ${notFound} 件`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
