/**
 * 入金取引 ↔ 売掛金のマッチングロジック
 *
 * 送金者名は通常カナ（口座名義）で届くため、Contact.company（漢字/ひらがな）と
 * 直接比較しても一致しない。このため下記のような正規化と曖昧一致を行う。
 *
 * 1. 送金者名の正規化
 *    - 半角カナ → 全角カナ
 *    - カタカナ → ひらがな
 *    - 法人格の除去（カ）,（カブ）,カブシキガイシャ,ユウゲンガイシャ等）
 *    - 空白・記号除去
 *
 * 2. Contact 側の正規化
 *    - 株式会社 / 有限会社 / ㈱ / ㈲ / (株) / (有) の除去
 *    - 漢字 → nameKana（あれば） → ひらがな化
 *
 * 3. 類似度スコア
 *    - 完全一致 = 1.0
 *    - 前方一致/後方一致 = 0.9
 *    - レーベンシュタイン距離ベース
 */

// ----------------------------------------------------------------
// 文字列正規化
// ----------------------------------------------------------------

/** 半角カナ → 全角カナ */
function toFullWidthKana(s: string): string {
  const halfToFull: Record<string, string> = {
    'ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ',
    'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ',
    'ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
    'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ',
    'ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
    'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ',
    'ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
    'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ',
    'ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
    'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ',
    'ﾜ':'ワ','ｦ':'ヲ','ﾝ':'ン',
    'ｰ':'ー','ﾞ':'゛','ﾟ':'゜',
  }
  let result = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    const next = s[i + 1]
    if (next === 'ﾞ') {
      const dakuten: Record<string, string> = {
        'ｶ':'ガ','ｷ':'ギ','ｸ':'グ','ｹ':'ゲ','ｺ':'ゴ',
        'ｻ':'ザ','ｼ':'ジ','ｽ':'ズ','ｾ':'ゼ','ｿ':'ゾ',
        'ﾀ':'ダ','ﾁ':'ヂ','ﾂ':'ヅ','ﾃ':'デ','ﾄ':'ド',
        'ﾊ':'バ','ﾋ':'ビ','ﾌ':'ブ','ﾍ':'ベ','ﾎ':'ボ',
        'ｳ':'ヴ',
      }
      if (dakuten[ch]) { result += dakuten[ch]; i++; continue }
    } else if (next === 'ﾟ') {
      const handakuten: Record<string, string> = {
        'ﾊ':'パ','ﾋ':'ピ','ﾌ':'プ','ﾍ':'ペ','ﾎ':'ポ',
      }
      if (handakuten[ch]) { result += handakuten[ch]; i++; continue }
    }
    result += halfToFull[ch] || ch
  }
  return result
}

/** カタカナ → ひらがな */
function katakanaToHiragana(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

/** 全角英数 → 半角英数 */
function toHalfAlphanum(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

/** 法人格の除去（前後どちらにあっても） */
function stripCompanyForms(s: string): string {
  const patterns = [
    /株式会社/g, /有限会社/g, /合同会社/g, /合名会社/g, /合資会社/g,
    /一般社団法人/g, /一般財団法人/g, /公益社団法人/g, /公益財団法人/g,
    /医療法人/g, /社会福祉法人/g, /学校法人/g, /宗教法人/g,
    /㈱/g, /㈲/g, /㈳/g, /㈶/g,
    /\(株\)/g, /（株）/g, /\(有\)/g, /（有）/g,
    // カナ表記の法人格
    /カブシキガイシャ/g, /カブシキカイシャ/g,
    /ユウゲンガイシャ/g, /ユウゲンカイシャ/g,
    /カ\)/g, /\(カ/g, /\(カ\)/g, /\（カ\）/g,
    /ユ\)/g, /\(ユ/g, /\(ユ\)/g, /\（ユ\）/g,
    // ひらがな化後の法人格
    /かぶしきがいしゃ/g, /かぶしきかいしゃ/g,
    /ゆうげんがいしゃ/g, /ゆうげんかいしゃ/g,
  ]
  let result = s
  for (const p of patterns) result = result.replace(p, '')
  return result
}

/**
 * 送金者名を正規化する（比較用）
 * 例: "ｶ)ﾘﾊﾞﾃｨﾎ-ﾑ" → "りばてぃほーむ"
 * 例: "株式会社リバティホーム" → "りばてぃほーむ"
 */
export function normalizePayerName(raw: string): string {
  if (!raw) return ''
  let s = raw.trim()
  // 全角英数 → 半角
  s = toHalfAlphanum(s)
  // 半角カナ → 全角カナ
  s = toFullWidthKana(s)
  // 法人格除去（カタカナ/漢字 両方対応。カタカナ→ひらがな変換前に漢字パターンを先に除去）
  s = stripCompanyForms(s)
  // カタカナ → ひらがな
  s = katakanaToHiragana(s)
  // 再度ひらがな版の法人格も除去
  s = stripCompanyForms(s)
  // 記号・スペースの除去
  s = s.replace(/[\s　,、.・。「」『』【】〈〉《》〔〕［］\[\](){}（）"'`＊*/\\\-ー―–—_＿=＝+＋#＃!！?？:：;；]/g, '')
  // 小文字化（英字含まれる場合）
  s = s.toLowerCase()
  return s
}

// ----------------------------------------------------------------
// 類似度スコア（0〜1）
// ----------------------------------------------------------------

/** レーベンシュタイン距離 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }
  return dp[m][n]
}

/**
 * 2つの正規化済み文字列の類似度を返す（0〜1）
 * - 完全一致 → 1.0
 * - 一方が他方を含む → 0.9
 * - それ以外 → レーベンシュタインベース
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  // どちらかが他方を完全に含む場合
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)
    // 短すぎる部分一致（"a"が全ての名前に含まれる等）を弾く
    if (shorter < 2) return 0
    return 0.85 + (shorter / longer) * 0.1
  }
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 0
  return Math.max(0, 1 - dist / maxLen)
}

// ----------------------------------------------------------------
// マッチング
// ----------------------------------------------------------------

export interface MatchableAR {
  id: string
  amount: number
  paidAmount: number
  status: string
  contactId: string
  Contact: {
    id: string
    name: string
    nameKana?: string | null
    company: string | null
  }
}

export interface MatchCandidate {
  ar: MatchableAR
  score: number
  reason: string
}

export interface MatchResult {
  bestMatch: MatchCandidate | null
  candidates: MatchCandidate[] // score >= 0.6 のもの、スコア降順
  autoMatched: boolean
}

/**
 * 入金取引に対する AR マッチング候補を返す
 *
 * - 金額完全一致（残額 = paymentAmount）が絶対条件
 * - 名前類似度でスコアリング
 * - スコア >= 0.8 かつ候補1件 → autoMatched
 */
export function matchPaymentToAR(
  paymentAmount: number,
  normalizedPayerName: string,
  ars: MatchableAR[],
  options: { autoMatchThreshold?: number } = {},
): MatchResult {
  const threshold = options.autoMatchThreshold ?? 0.8
  // 金額一致のみフィルタ（残額 = 支払金額）
  const amountMatched = ars.filter(ar => {
    const remaining = ar.amount - ar.paidAmount
    return remaining === paymentAmount
  })

  const candidates: MatchCandidate[] = amountMatched.map(ar => {
    const companyNorm = normalizePayerName(ar.Contact.company || '')
    const kanaNorm = normalizePayerName(ar.Contact.nameKana || '')
    const nameNorm = normalizePayerName(ar.Contact.name || '')
    const s1 = nameSimilarity(normalizedPayerName, companyNorm)
    const s2 = nameSimilarity(normalizedPayerName, kanaNorm)
    const s3 = nameSimilarity(normalizedPayerName, nameNorm)
    const score = Math.max(s1, s2, s3)
    const reason = score === s1 ? 'company'
      : score === s2 ? 'nameKana'
      : 'name'
    return { ar, score, reason }
  })

  candidates.sort((a, b) => b.score - a.score)
  const good = candidates.filter(c => c.score >= 0.6)
  const best = good[0] ?? null
  // 自動消込判定: トップが閾値以上 AND 2番目との差が 0.2 以上 OR 2番目がない
  let autoMatched = false
  if (best && best.score >= threshold) {
    const second = good[1]
    if (!second || best.score - second.score >= 0.2) {
      autoMatched = true
    }
  }

  return { bestMatch: best, candidates: good, autoMatched }
}
