/**
 * gemini-meeting.ts
 *
 * Meet議事録 → 要約 + ネクストアクション抽出 を Gemini で行う。
 */
import { GoogleGenerativeAI } from '@google/generative-ai'

function getModel(modelName = 'gemini-2.0-flash') {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'your-api-key-here') throw new Error('GEMINI_API_KEYが未設定です')
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName })
}

export interface MeetingAnalysis {
  summary: string                    // 3〜5行の要約
  keyDecisions: string[]             // 決定事項の箇条書き
  nextActions: ExtractedTask[]       // 抽出したネクストアクション
}

export interface ExtractedTask {
  task: string                       // タスク内容
  assignee?: string                  // 担当者名（推測）
  dueDate?: string                   // 期日 (YYYY-MM-DD形式、相対表現から推測)
  priority?: 'HIGH' | 'MEDIUM' | 'LOW'
  relatedContact?: string            // 関連するお客様
}

/**
 * Meet議事録テキストから要約・決定事項・ネクストアクションを抽出
 *
 * @param transcript 議事録本文（通常はMeet transcriptの.docx/pdfから抽出したプレーンテキスト）
 * @param context 追加コンテキスト（打ち合わせタイトル、参加者など）
 */
export async function analyzeMeetingTranscript(
  transcript: string,
  context?: { title?: string; participants?: string[]; date?: string }
): Promise<MeetingAnalysis> {
  const model = getModel('gemini-2.0-flash')

  const contextBlock = context
    ? `### 打ち合わせ情報
- タイトル: ${context.title || '(不明)'}
- 日時: ${context.date || '(不明)'}
- 参加者: ${context.participants?.join('、') || '(不明)'}
`
    : ''

  const prompt = `次の打ち合わせ議事録を分析して、以下の3項目をJSON形式で抽出してください。

${contextBlock}
### 議事録本文
${transcript}

### 抽出項目

1. **summary**: 3〜5行でこの打ち合わせの要点をまとめる
2. **keyDecisions**: 合意・決定された事項を箇条書き配列で
3. **nextActions**: ネクストアクション（やるべきタスク）を配列で
   - 各タスクには以下のフィールドを含める:
     - task: タスク内容（具体的に）
     - assignee: 担当者名（文脈から推測。LTS側の人名ならそのまま、先方の人名もOK。不明なら null）
     - dueDate: 期日（"明日"→翌日日付、"来週"→1週間後、など相対表現から YYYY-MM-DD 形式に変換。不明なら null）
     - priority: "HIGH" | "MEDIUM" | "LOW"（緊急性・重要性から判定）
     - relatedContact: 関連するお客様名（文脈から推測。不明なら null）

### 出力形式
必ず以下の JSON のみを出力（前後の説明文禁止）:

\`\`\`json
{
  "summary": "要約テキスト",
  "keyDecisions": ["決定事項1", "決定事項2"],
  "nextActions": [
    {
      "task": "見積書を作成して送付する",
      "assignee": "龍竹",
      "dueDate": "2026-04-24",
      "priority": "HIGH",
      "relatedContact": "sky-connect"
    }
  ]
}
\`\`\`

本日の日付は ${new Date().toISOString().slice(0, 10)} です。相対表現から日付を算出する際はこの日を基準にしてください。`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  // JSONパース（```json ブロック内または直接JSONを想定）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/)
  const jsonStr = jsonMatch ? jsonMatch[1] : text

  try {
    const parsed = JSON.parse(jsonStr) as MeetingAnalysis
    return {
      summary: parsed.summary || '',
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : [],
    }
  } catch (e) {
    console.error('[gemini-meeting] JSONパース失敗:', text.slice(0, 200))
    return {
      summary: text.slice(0, 500),
      keyDecisions: [],
      nextActions: [],
    }
  }
}
