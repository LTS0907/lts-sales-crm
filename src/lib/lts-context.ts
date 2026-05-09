/* ************************************************************************** */
/*                                                                            */
/*    lts-context.ts                                    :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/05/09                              #+#    #+#         */
/*    Updated: 2026/05/09                              ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */

/**
 * LTS（株式会社ライフタイムサポート）のプロフィール・事業情報
 * メール生成プロンプトの先頭に固定で組み込む。
 */
export const LTS_PROFILE_PROMPT = `【会社・代表のプロフィール】
- 株式会社ライフタイムサポート 代表取締役 龍竹一生（りょうちく かずい）
- 経歴：リフォーム業出身。現場のアナログな業務を自社で内製化してDX化した実業家。
- 受賞：第3回 埼玉DX大賞 受賞（https://www.saitamadx.com/dxaward/introduction_3rd/）
- スタンス：「IT企業のツール提案」ではなく「実業の経営者が実践した解決策」として伝える
- 連絡先：070-1298-0180 / ryouchiku@life-time-support.com

【企業理念】
IT音痴の現場を、最強のDXチームへ。伴走型サポートで、自走できる組織を作る。

【主要サービス（5本柱）】
1. AI社員（24時間365日電気代だけで働く・業務自動化を担うAIエージェント）
2. IT内製化サポート（月額15万円〜・補助金活用可）
3. WEBマーケティングサポート（自社実績：月間200件以上の問い合わせ）
4. デバイス販売（Amazonより安いPC販売）
5. 生成AI活用セミナー（3ヶ月コース・人材開発支援助成金で実質3.75万円〜）

【代表的な導入事例（年間削減効果）】
- 不動産業界：レインズ情報の自動収集・選定（年間528時間削減）
- 事務・EC：オーダー製品の帳票自動作成・印刷（年間約1,000万円削減）
- 顧客対応：LINE顧客対応の自動化（年間180時間削減+満足度UP）
- リフォーム施工：顧客対応の一次対応自動化（年間288万円削減）
- 通信系：営業マン6名がMyGPTsで顧客情報を学習（年間158.4万円削減）

【トーン・口調の指示】
- 誠実で落ち着いたビジネスライク。ただし「現場感」を必ず出す。
- 「IT専門家として」ではなく「実業の経営者として」の温度感で書く。
- 過度な敬語・修飾語・絵文字は避ける（メールは最終的にビジネス相手に送られる）。
- 文字数は自然な長さで。スマホで読みやすい改行を多用。`

/**
 * NoteカテゴリコードをAIプロンプト表示用の日本語ラベルに変換するマップ。
 * ContactDetailClient.tsx の NOTE_CATS と同期させること。
 */
export const NOTE_CATEGORY_LABEL: Record<string, string> = {
  GENERAL: '一般',
  MEETING: '会議',
  PREFERENCE: '好み',
  BACKGROUND: '経歴',
  LEAD: 'リード',
  APPOINTMENT: 'アポ調整',
  MEETING_SET: '商談設定',
  MEETING_DONE: 'アポ調整完了',
  PROPOSING: '提案中',
  CONTRACTED: '入金待ち',
  PAID: '入金完了',
  LOST: '失注',
  ON_HOLD: '保留',
  NURTURING: '育成中',
  INTERESTED: '関心あり',
  LONG_TERM: '長期育成',
}

/**
 * Noteの配列をプロンプト挿入用テキストに変換する。
 * @param notes Note配列（createdAt降順）
 * @param maxNotes 最大件数（デフォルト20）
 * @param maxContentLength 1件あたりの最大文字数（デフォルト500）
 */
export function formatNotesForPrompt(
  notes: Array<{ content: string; category: string; createdAt: Date }>,
  maxNotes = 20,
  maxContentLength = 500
): string {
  if (notes.length === 0) return '（メモ・記録なし）'

  return notes
    .slice(0, maxNotes)
    .map(note => {
      const dateStr = note.createdAt.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
      const catLabel = NOTE_CATEGORY_LABEL[note.category] ?? note.category
      const content = note.content.length > maxContentLength
        ? note.content.slice(0, maxContentLength) + '…'
        : note.content
      return `[${dateStr}/${catLabel}] ${content}`
    })
    .join('\n')
}
