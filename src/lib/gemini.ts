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
  title: string | null, episodeMemo: string | null, recommendedServices: string | null
): Promise<{ subject: string; body: string }> {
  const twoMonthsLater = new Date()
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2)
  const deadline = `${twoMonthsLater.getFullYear()}年${twoMonthsLater.getMonth() + 1}月末`

  const prompt = `以下の顧客に送る営業メールを作成してください。

顧客情報:
- 宛名: ${company || ''}${department ? ' ' + department : ''} ${title ? title + ' ' : ''}${name}様
- 出会い・コメント: ${episodeMemo || '（なし）'}
- 推奨サービス: ${recommendedServices || '生成AI活用セミナー'}

送信者: 龍竹一生（株式会社ライフタイムサポート）
メール: ryouchiku@life-time-support.com
電話: 070-1298-0180

要件:
- 押し売り感を出さない
- 出会いのエピソードを250〜300文字で振り返る
- 埼玉DX大賞受賞等の実績を150〜200文字で記載
- 助成金活用（${deadline}締切）を案内
- 無料15分オンライン相談へ誘導
- 敬語（です・ます調）、1文60文字以内、改行多め

JSON形式で返してください:
{
  "subject": "件名",
  "body": "本文"
}`

  const text = await generateText(prompt)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Failed to parse email JSON')
  return JSON.parse(match[0])
}

export async function refineEmail(
  subject: string, body: string, instruction: string
): Promise<{ subject: string; body: string }> {
  const prompt = `以下のメールを指示に従って修正してください。

現在の件名: ${subject}
現在の本文:
${body}

修正指示: ${instruction}

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
