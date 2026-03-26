/* ************************************************************************** */
/*                                                                            */
/*    gemini.ts                                         :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { GoogleGenerativeAI } from '@google/generative-ai'

function getModel(modelName = 'gemini-2.0-flash') {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'your-api-key-here') throw new Error('GEMINI_API_KEYが未設定です')
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName })
}

export async function generateText(prompt: string): Promise<string> {
  const model = getModel()
  const result = await model.generateContent(prompt)
  return result.response.text()
}

export async function scanBusinessCard(imageBase64: string, mimeType: string): Promise<Record<string, string>> {
  const model = getModel()
  const result = await model.generateContent([
    { inlineData: { data: imageBase64, mimeType } },
    `この名刺画像から情報を読み取り、以下のJSON形式で返してください。読み取れない項目は空文字にしてください。JSONのみを返してください。

{
  "name": "氏名",
  "nameKana": "フリガナ",
  "company": "会社名",
  "department": "部署",
  "title": "役職",
  "email": "メールアドレス",
  "phone": "電話番号",
  "website": "ウェブサイト",
  "address": "住所"
}`,
  ])
  const text = result.response.text()
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('JSON not found')
  return JSON.parse(match[0])
}

export async function summarizeCompany(companyName: string, websiteText: string): Promise<string> {
  return generateText(`「${companyName}」の会社情報をビジネスパーソン向けに3〜5文でまとめてください（日本語）。\n\nウェブサイト情報:\n${websiteText.slice(0, 3000)}`)
}

export async function summarizeContact(
  name: string, company: string | null, title: string | null,
  notes: Array<{ content: string; createdAt: Date; category: string }>
): Promise<string> {
  const notesText = notes.map(n => `[${n.createdAt.toLocaleDateString('ja-JP')}/${n.category}] ${n.content}`).join('\n---\n')
  return generateText(`「${name}」さん（${company || '不明'}、${title || '不明'}）について以下のメモを元に、①3文の人物像 ②関心キーワード(箇条書き) ③関係性状態(良好/普通/要注意)をまとめてください。\n\nメモ:\n${notesText.slice(0, 4000)}`)
}

export async function recommendServices(
  name: string, company: string | null, department: string | null, title: string | null, episodeMemo: string | null
): Promise<{ services: string[]; reason: string }> {
  const services = ['生成AI活用セミナー', 'AIパーソナルトレーニング', 'IT内製化サポート', 'WEBマーケティングサポート', 'デバイス販売']
  const prompt = `以下の顧客情報から、提案すべきサービスとその理由をJSON形式で返してください。

顧客情報:
- 氏名: ${name}
- 会社: ${company || '不明'}
- 部署: ${department || '不明'}
- 役職: ${title || '不明'}
- メモ: ${episodeMemo || 'なし'}

サービス一覧:
${services.map((s, i) => `${i + 1}. ${s}`).join('\n')}

JSON形式:
{
  "services": ["推奨サービス名1", "推奨サービス名2"],
  "reason": "推奨理由（2〜3文）"
}`
  const text = await generateText(prompt)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { services: [], reason: '' }
  return JSON.parse(match[0])
}

export async function generateEmail(
  name: string, company: string | null, department: string | null,
  title: string | null, episodeMemo: string | null, recommendedServices: string | null,
  additionalInstructions?: string
): Promise<{ subject: string; body: string }> {
  const now = new Date()
  now.setMonth(now.getMonth() + 2)
  const deadlineText = `${now.getMonth() + 1}月末`
  const position = [department, title].filter(Boolean).join(' ') || ''

  const systemPrompt = `あなたは、礼儀正しく、信頼感のあるプロフェッショナルの営業担当者です。
相手に失礼がなく、かつ誠実さが伝わるビジネスメールを作成してください。
過度な修飾語や情緒的な表現は避け、ビジネスの文脈で好感を持たれる「落ち着いた丁寧さ」を意識してください。
読み手にとってストレスがないよう、適度な改行と余白を入れてデザインしてください。`

  const additionalInstructionText = additionalInstructions?.trim()
    ? `\n--------------------------------------------------\n【★重要：ユーザーからの追加修正指示】\n以下の指示を最優先して反映してください：\n「${additionalInstructions}」\n--------------------------------------------------\n`
    : ''

  const userPrompt = `以下の情報を基に、お礼メールを作成してください。
${additionalInstructionText}
【相手情報】
会社名: ${company || ''}
役職: ${position}
氏名: ${name}
エピソードのヒント: ${episodeMemo || '（なし）'}

【必須構成とルール】
[全体ルール]読みやすくするために"。"で必ず改行をすること。

1. **宛名**: 会社名、役職、氏名を正確に記載。
2. **挨拶と感謝**: 丁寧な挨拶と、名刺交換やご紹介をいただいたことへの感謝。
3. **＜エピソードトーク＞**:
   - 「エピソードのヒント」をもとに、当日の会話を振り返る内容を作成すること。
   - 文字数は **250文字〜300文字** 程度。
   - スマホでの視認性を考慮し、2〜3文ごとに改行を入れること。
4. **＜エビデンストーク＞**:
   - 弊社のバックグラウンド（リフォーム業出身、現場のアナログな課題からDXを自社内製化した経緯）を必ず交えること。
   - 「埼玉DX大賞」受賞（https://www.saitamadx.com/dxaward/introduction_3rd/）の事実に触れ、信頼性を高める。
   - 「IT企業のツール提案」ではなく「実業の経営者が実践した解決策」という温度感で記載。
   - 文字数は **150文字〜200文字** 程度で作成すること。
5. **＜サービス案内までの繋ぎ文章＞**:
   - 上記のエピソードとエビデンスの内容を受け、自然な流れでサービス案内に話題を変えること。
   - 特に営業色が強くならないよう、「もしお役に立てる部分があれば」という謙虚かつ自然な流れを意識すること。
6. **サービス案内**（各項目の間に必ず空行を入れること）:

【ご提供中の主なサポート】※研修には助成金の活用も可能で、費用の最大75％が補填される仕組みもございます

従業員様向け AI活用セミナー
https://drive.google.com/file/d/1S-lzgoxzZMlqa8V3ItM5t-qmikbYQhO3/view?usp=sharing

【オーダーメイド式】生成AIパーソナルトレーニング
https://drive.google.com/file/d/1Ks9axZLMnc3lh16pG_BxDSDJbpuQCY-7/view?usp=sharing

AX / DX内製化サポート
https://drive.google.com/file/d/1DZ9FqNasdLh6uN2sGkpdc4No05F8-iKb/view?usp=drive_link

WEBマーケティングサポート
https://drive.google.com/file/d/1ZA1evKizEijBgdXYUP04eFoKzUM7HFpC/view?usp=sharing

デバイス格安販売
https://drive.google.com/file/d/17V3UjCSCy9z8prBEPRxkTMskcrFU8PEO/view?usp=sharing

7. **無料コンサルティング案内**:
   - 「${deadlineText}までの期間限定で実施している1時間の無料コンサルティング」を案内。
   - 「御社の現場が楽になるAI活用」について意見交換したい旨を伝える。
8. **結び**: 相手のさらなる発展を願う丁寧な結び。
9. **署名**:
   株式会社ライフタイムサポート
   龍竹 一生
   070-1298-0180

【全体のトーン】
- 誠実でビジネスライクながらも、実業界出身らしい「現場感」のあるトーン。
- 改行を多用し、スマホでも読みやすい見た目を徹底。
- 件名は不要。本文のみ出力。`

  const [body, subjectRaw] = await Promise.all([
    generateText(`${systemPrompt}\n\n${userPrompt}`),
    generateText(`以下の情報を元に、営業メールの件名を1行だけ出力してください。余計な説明は不要です。
例: 先日の2月例会にてご挨拶の御礼（株式会社ライフタイムサポート 龍竹）
会社名: ${company || ''}　氏名: ${name}　出会い: ${episodeMemo?.slice(0, 80) || ''}`),
  ])

  const subject = subjectRaw.trim().replace(/^(件名[:：]\s*|「|」)/g, '')
  return { subject, body }
}

export async function refineEmail(
  subject: string, body: string, instruction: string
): Promise<{ subject: string; body: string }> {
  const prompt = `以下のメールを指示に従って修正してください。

--------------------------------------------------
【★重要：ユーザーからの修正指示】
以下の指示を最優先して反映してください：
「${instruction}」
--------------------------------------------------

現在の件名: ${subject}
現在の本文:
${body}

修正後をJSON形式で返してください:
{
  "subject": "件名",
  "body": "本文"
}`
  const text = await generateText(prompt)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Failed to parse refined email JSON')
  return JSON.parse(match[0])
}

export async function generateFollowUp(
  name: string, company: string | null, touchNumber: number, previousResponse: string | null
): Promise<string> {
  return generateText(`${company || ''}の${name}様へのフォローアップメール（${touchNumber}回目）を作成してください。
前回の反応: ${previousResponse || 'なし（返信なし）'}
押し売り感なく、価値ある情報提供を中心に、200〜300文字程度で。署名なし。`)
}
