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
import { LTS_PROFILE_PROMPT, formatNotesForPrompt } from '@/lib/lts-context'

function getModel(modelName = 'gemini-3-flash-preview') {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'your-api-key-here') throw new Error('GEMINI_API_KEYが未設定です')
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName })
}

export async function generateText(prompt: string): Promise<string> {
  const model = getModel()
  const result = await model.generateContent(prompt)
  return result.response.text()
}

export async function scanBusinessCard(
  images: Array<{ base64: string; mimeType: string }> | string,
  legacyMimeType?: string
): Promise<Record<string, string>> {
  // 旧シグネチャ互換: scanBusinessCard(base64, mimeType)
  const imgs = typeof images === 'string'
    ? [{ base64: images, mimeType: legacyMimeType || 'image/jpeg' }]
    : images

  if (imgs.length === 0) throw new Error('画像がありません')

  const model = getModel()
  const isMulti = imgs.length > 1
  const prompt = isMulti
    ? `これらは同じ人物の名刺の${imgs.length}面（表面・裏面など）です。すべての画像を統合して、最も情報量が多くなるよう以下のJSON形式で返してください。
複数の画像で異なる情報があれば併記、同じ情報があれば1つにまとめてください。
読み取れない項目は空文字にしてください。JSONのみを返してください。

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
}`
    : `この名刺画像から情報を読み取り、以下のJSON形式で返してください。読み取れない項目は空文字にしてください。JSONのみを返してください。

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
}`

  const parts = imgs.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }))

  // 429 (Resource exhausted) の指数バックオフリトライ
  const MAX_RETRIES = 4
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent([...parts, prompt])
      const text = result.response.text()
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('JSON not found')
      return JSON.parse(match[0])
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      const isRateLimit = /429|Too Many Requests|Resource exhausted|RATE_LIMIT/i.test(msg)
      if (!isRateLimit || attempt === MAX_RETRIES - 1) throw e
      // 指数バックオフ: 2s, 4s, 8s + ジッター
      const delayMs = 2000 * Math.pow(2, attempt) + Math.random() * 500
      console.log(`[gemini] rate-limited, retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastError
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
  additionalInstructions?: string,
  notes?: Array<{ content: string; category: string; createdAt: Date }>
): Promise<{ subject: string; body: string }> {
  const now = new Date()
  now.setMonth(now.getMonth() + 2)
  const deadlineText = `${now.getMonth() + 1}月末`
  const position = [department, title].filter(Boolean).join(' ') || ''

  const systemPrompt = `${LTS_PROFILE_PROMPT}

あなたは、礼儀正しく、信頼感のあるプロフェッショナルの営業担当者です。
相手に失礼がなく、かつ誠実さが伝わるビジネスメールを作成してください。
過度な修飾語や情緒的な表現は避け、ビジネスの文脈で好感を持たれる「落ち着いた丁寧さ」を意識してください。
読み手にとってストレスがないよう、適度な改行と余白を入れてデザインしてください。`

  const additionalInstructionText = additionalInstructions?.trim()
    ? `\n--------------------------------------------------\n【★重要：ユーザーからの追加修正指示】\n以下の指示を最優先して反映してください：\n「${additionalInstructions}」\n--------------------------------------------------\n`
    : ''

  const notesText = formatNotesForPrompt(notes ?? [])

  const userPrompt = `以下の情報を基に、お礼メールを作成してください。
${additionalInstructionText}
【相手情報】
会社名: ${company || ''}
役職: ${position}
氏名: ${name}
エピソードのヒント: ${episodeMemo || '（なし）'}

【メモ・記録】（この顧客との会話履歴・蓄積情報。エピソードトークや提案内容に活かすこと）
${notesText}

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
   - 「第3回 埼玉DX大賞」受賞の事実に触れ、信頼性を高める。
   - **重要**: 埼玉DX大賞のURL（https://www.saitamadx.com/dxaward/introduction_3rd/）を必ず本文に記載すること。受賞の文章のすぐ次の行に、URLを単独行で改行して挿入する。省略・要約禁止。
   - 「IT企業のツール提案」ではなく「実業の経営者が実践した解決策」という温度感で記載。
   - 文字数は **150文字〜200文字** 程度で作成すること。

   【エビデンストークの良い書き方例】
   ---
   私自身、もともとはリフォーム業の経営者として、アナログな現場業務に長年向き合ってまいりました。その中で「これは自分達でDX化するしかない」と決意し、現場の課題を一つずつ自社で内製化してきました。

   その取り組みが評価され、先日「第3回 埼玉DX大賞」を受賞することができました。
   https://www.saitamadx.com/dxaward/introduction_3rd/

   IT企業の理屈ではなく、実業の経営者として現場で実践してきた解決策をお届けできればと考えております。
   ---
5. **＜サービス案内までの繋ぎ文章＞**:
   - 上記のエピソードとエビデンスの内容を受け、自然な流れでサービス案内に話題を変えること。
   - 特に営業色が強くならないよう、「もしお役に立てる部分があれば」という謙虚かつ自然な流れを意識すること。
6. **サービス案内**（各項目の間に必ず空行を入れること）:

【ご提供中の主なサポート】※研修には助成金の活用も可能で、費用の最大75％が補填される仕組みもございます

従業員様向け AI活用セミナー
https://drive.google.com/file/d/1S-lzgoxzZMlqa8V3ItM5t-qmikbYQhO3/view?usp=sharing

24時間365日電気代だけで働く【AI社員】
https://drive.google.com/file/d/1t_qRDSzgOl31uK7p9cc_KfLFgRyMyC2t/view?usp=drive_link

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

  // 件名は「前半（名刺交換のお礼の文言）」だけAIに作らせ、末尾の差出人表記はコードで強制連結する。
  // 「名刺交換」のキーワードは必ず含めること（オーナー要望）。Gemini指示無視時はコード側で強制差し替え。
  const SUBJECT_SUFFIX = '（株式会社ライフタイムサポート 龍竹）'
  const SUBJECT_FALLBACK = '名刺交換のお礼'
  const subjectPrompt = `あなたは「名刺交換のお礼メール」の件名の【前半部分】のみを作成する担当です。

【最重要ルール】
- 件名には必ず「名刺交換のお礼」または「名刺交換の御礼」というフレーズを含めること
- 「面談」「ご面談」「お打合せ」「打合せ」「ご紹介」「ご挨拶」「お会い」等は使わない
- 全てのケースが名刺交換から始まったお礼メールであるため、必ず「名刺交換」というワードを使うこと

【出力ルール】
- 末尾の差出人表記は別途自動付与されるため、出力に含めないこと
- 説明・前置き・引用符・括弧書き・「件名:」の接頭辞は一切不要
- 全角25文字以内
- 必ず「名刺交換のお礼」または「名刺交換の御礼」で終わること

【絶対にやってはいけないこと】
- ❌ 「名刺交換」を含めない（最重要）
- ❌ 「面談」「お打合せ」「ご紹介」「ご挨拶」「お会い」等の別の出来事を表す言葉
- ❌ 受信者の氏名・会社名・役職・敬称（様 等）を入れる
- ❌ 末尾に括弧書き「（◯◯）」を付ける（自動付与されるため）
- ❌ 売り込み感のある言葉（「ご提案」「ご商談」「サービスのご案内」等）

【良い出力例】（「名刺交換」を必ず含む）
✅ 名刺交換のお礼
✅ 先日の名刺交換の御礼
✅ ◯◯展示会にて名刺交換のお礼
✅ ◯◯交流会での名刺交換の御礼
✅ 先日の異業種交流会での名刺交換のお礼

【悪い出力例】
❌ 先日のご面談のお礼 ← 「名刺交換」が入ってない
❌ ご挨拶の御礼 ← 「名刺交換」が入ってない
❌ ご紹介いただきましたお礼 ← 「名刺交換」が入ってない
❌ 名刺交換のお礼（株式会社ライフタイムサポート 龍竹） ← 末尾の括弧書きを付けない
❌ 栗原様 社労士事務所 名刺交換のお礼 ← 受信者情報を入れない

【参考情報】
出会いの文脈（episodeMemo・先頭150文字）: ${episodeMemo?.slice(0, 150) || '（不明）'}
※文脈にイベント名・展示会名・場所が含まれていれば、それを修飾語として「◯◯にて名刺交換のお礼」のように使ってOK
※文脈が不明 or 抽象的なら、シンプルに「名刺交換のお礼」だけでOK`

  const [body, subjectRaw] = await Promise.all([
    generateText(`${systemPrompt}\n\n${userPrompt}`),
    generateText(subjectPrompt),
  ])

  // AI出力をクリーンアップ：接頭辞・引用符・末尾の括弧書きを除去
  const subjectPrefix = subjectRaw
    .trim()
    .replace(/^(件名[:：]\s*|「|」)/g, '')
    .replace(/[（(][^（）()]*[）)]\s*$/, '')  // 末尾の括弧書きを除去
    .trim()

  // 「名刺交換」が含まれていない場合は強制的にフォールバック（AI指示無視を構造的に防止）
  const safePrefix = subjectPrefix && subjectPrefix.includes('名刺交換')
    ? subjectPrefix
    : SUBJECT_FALLBACK

  // 末尾の差出人表記を強制連結（AIに依存しない）
  const subject = `${safePrefix}${SUBJECT_SUFFIX}`
  return { subject, body }
}

export async function refineEmail(
  subject: string, body: string, instruction: string,
  notes?: Array<{ content: string; category: string; createdAt: Date }>
): Promise<{ subject: string; body: string }> {
  const notesSection = notes && notes.length > 0
    ? `\n【メモ・記録】（修正時の参考情報）\n${formatNotesForPrompt(notes)}\n`
    : ''

  const prompt = `${LTS_PROFILE_PROMPT}

以下のメールを指示に従って修正してください。

--------------------------------------------------
【★重要：ユーザーからの修正指示】
以下の指示を最優先して反映してください：
「${instruction}」
--------------------------------------------------
${notesSection}
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
