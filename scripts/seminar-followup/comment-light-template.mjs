/**
 * comment-light-template.mjs — コメント軽引用型のセミ汎用テンプレ
 *
 * 用途: コメント有 × 要注意に該当しない参加者向け（Phase 2 B案）
 *
 * 特徴:
 *   - コメントを「」で引用してから短く受け止める
 *   - 満足度でトーンを微調整（非常に満足/満足 → ポジティブ、ふつう → 中立、不満 → 謙虚）
 *   - 役職・部署で呼びかけを整形
 *   - 関心度（研修/サポート）への軽い触れ言
 */

function addressLine({ company, department, title, name }) {
  const pos = [department, title].filter(s => s && s.trim()).join('　')
  const lines = [company]
  if (pos) lines.push(pos + '　' + name + ' 様')
  else lines.push(name + ' 様')
  return lines.join('\n')
}

function receiveCommentBlock({ name, comment, satisfaction }) {
  const neg = satisfaction === 'やや不満' || satisfaction === '不満'
  const neutral = satisfaction === 'ふつう' || !satisfaction
  const quote = comment.trim()

  if (neg) {
    return `「${quote}」\n\n${name}様からのこの率直なご指摘、真摯に受け止めております。\n1時間という限られた時間の中で十分にお伝えしきれなかった点、\nこちらの伝え方の至らなさとして反省材料にさせていただきます。`
  }
  if (neutral) {
    return `「${quote}」\n\n${name}様よりご感想をお寄せいただけましたこと、\nありがたく拝読いたしました。`
  }
  // 非常に満足 or 満足
  return `「${quote}」\n\n${name}様からこのようなお言葉を頂戴でき、\n登壇した者として心より嬉しく拝読いたしました。`
}

function interestLine({ trainingInterest, supportInterest }) {
  const wantTraining = trainingInterest === '参加したい' || trainingInterest === '興味がある'
  const wantSupport = supportInterest === '利用したい' || supportInterest === '興味がある'

  if (wantTraining && wantSupport) {
    return 'また、AI研修・AIサポート双方にご関心をお寄せいただき、重ねて御礼申し上げます。'
  }
  if (wantTraining) {
    return 'また、AI研修にご関心をお寄せいただき、重ねて御礼申し上げます。'
  }
  if (wantSupport) {
    return 'また、AIサポートにご関心をお寄せいただき、重ねて御礼申し上げます。'
  }
  return ''
}

export function renderLightTemplate({ company, department, title, name, comment, trainingInterest, supportInterest, satisfaction }) {
  const address = addressLine({ company, department, title, name })
  const commentBlock = receiveCommentBlock({ name, comment, satisfaction })
  const interest = interestLine({ trainingInterest, supportInterest })
  const interestBlock = interest ? `\n\n${interest}` : ''

  const subject = '4/17「超実践！リフォームAI活用講座」ご参加の御礼（株式会社ライフタイムサポート 龍竹）'

  const body = `${address}

お世話になっております。
株式会社ライフタイムサポート 代表の龍竹一生です。

この度は4月17日(金)に開催させていただきました
「超実践！リフォームAI活用講座」にご参加いただき、誠にありがとうございました。

またアンケートにもご丁寧なコメントをお寄せくださり、重ねて御礼申し上げます。

──────────────

${commentBlock}${interestBlock}

──────────────

申し遅れましたが、弊社は元々、埼玉県でリフォーム事業を営んでおりました。

現場のアナログな業務を、外部のITに頼らず
「自社内で一つずつ内製化する」方針で解決してきた積み重ねが評価され、
昨年「第3回 埼玉DX大賞」を受賞しております。
https://www.saitamadx.com/dxaward/introduction_3rd/

IT企業がツール目線で語る話ではなく、
同じリフォーム業界を実際に回してきた実業の立場として、
「現場にAIをどう落とすか」をお話しできる点が、
弊社の一番の強みだと考えております。

──────────────

もしよろしければ、お手元でゆっくりご覧いただけるよう、
4/17のセミナー当日の資料をお送りさせていただきます。

▼セミナー資料（当日スライド）
https://drive.google.com/file/d/1p2Cly0zoOazZzzq5duffi2UDe68eVhQd/view?usp=drive_link

ご参加当日はお伝えしきれなかった活用事例や図解も含まれておりますので、
社内のご議論の参考にしていただければ幸いです。

──────────────

【ご提供中のサポート】
※研修には助成金の活用も可能で、費用の最大75％が補填される仕組みもございます。

▼従業員様向け AI活用セミナー（← 弊社の主力サービス / 助成金対応）
https://drive.google.com/file/d/1S-lzgoxzZMlqa8V3ItM5t-qmikbYQhO3/view?usp=sharing

▼AX / DX内製化サポート（月額伴走型）
https://drive.google.com/file/d/1DZ9FqNasdLh6uN2sGkpdc4No05F8-iKb/view?usp=drive_link

▼WEBマーケティングサポート
https://drive.google.com/file/d/1ZA1evKizEijBgdXYUP04eFoKzUM7HFpC/view?usp=sharing

▼デバイス格安販売
https://drive.google.com/file/d/17V3UjCSCy9z8prBEPRxkTMskcrFU8PEO/view?usp=sharing

▼【オーダーメイド式】生成AIパーソナルトレーニング（保険的 / 個別深掘り用）
https://drive.google.com/file/d/1Ks9axZLMnc3lh16pG_BxDSDJbpuQCY-7/view?usp=sharing

──────────────

【無料コンサルティングのご案内】

6月末までの期間限定で、
「御社の現場が楽になるAI活用」について意見交換させていただく
1時間の無料コンサルティングをご用意しております。

${name}様のご関心のある領域に絞って、
率直にお話しできればと思っております。
お気軽にご相談ください。

──────────────

末筆ではございますが、
${company}様、ならびに${name}様の益々のご発展を
心よりお祈り申し上げます。

今後ともどうぞよろしくお願いいたします。

株式会社ライフタイムサポート
代表取締役　龍竹 一生
TEL: 070-1298-0180
Mail: ryouchiku@life-time-support.com
`

  return { subject, body }
}
