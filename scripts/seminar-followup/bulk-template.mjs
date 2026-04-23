/**
 * bulk-template.mjs — コメントなし参加者向けの一括御礼メールテンプレ生成
 *
 * 使い方:
 *   import { renderBulkEmail } from './bulk-template.mjs'
 *   const { subject, body } = renderBulkEmail({ company, department, title, name, trainingInterest, supportInterest })
 *
 * 特徴:
 *   - 個別コメントへの返信は無し（コメント欄が空の方向け）
 *   - AI研修 / AIサポート への回答（興味がある / 特に必要ない / 空欄）で
 *     メッセージ末尾の呼びかけ温度をわずかに変える
 *   - それ以外は共通文面
 */

function addressLine({ company, department, title, name }) {
  const pos = [department, title].filter(s => s && s.trim()).join('　')
  const lines = [company]
  if (pos) lines.push(pos + '　' + name + ' 様')
  else lines.push(name + ' 様')
  return lines.join('\n')
}

function interestLine({ trainingInterest, supportInterest }) {
  const wantTraining = trainingInterest === '参加したい' || trainingInterest === '興味がある'
  const wantSupport = supportInterest === '利用したい' || supportInterest === '興味がある'

  if (wantTraining && wantSupport) {
    return 'アンケートにてAI研修・AIサポート双方にご関心をお寄せいただき、\n誠にありがとうございます。'
  }
  if (wantTraining) {
    return 'アンケートにてAI研修にご関心をお寄せいただき、\n誠にありがとうございます。'
  }
  if (wantSupport) {
    return 'アンケートにてAIサポートにご関心をお寄せいただき、\n誠にありがとうございます。'
  }
  return '' // 両方「特に必要ない」の場合は触れない
}

export function renderBulkEmail({ company, department, title, name, trainingInterest, supportInterest }) {
  const address = addressLine({ company, department, title, name })
  const interest = interestLine({ trainingInterest, supportInterest })
  const interestBlock = interest ? `\n${interest}\n\n──────────────\n` : ''

  const subject = '4/17「超実践！リフォームAI活用講座」ご参加の御礼（株式会社ライフタイムサポート 龍竹）'

  const body = `${address}

お世話になっております。
株式会社ライフタイムサポート 代表の龍竹一生です。

この度は4月17日(金)に開催させていただきました
「超実践！リフォームAI活用講座」にご参加いただき、誠にありがとうございました。

ご多忙の中お時間を頂戴し、重ねて御礼申し上げます。
${interestBlock}
弊社は元々、埼玉県でリフォーム事業を営んでおりました。

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

併せて、弊社からご提供中のサポートをご案内させていただきます。
※研修には助成金の活用も可能で、費用の最大75％が補填される仕組みもございます。

▼従業員様向け AI活用セミナー
https://drive.google.com/file/d/1S-lzgoxzZMlqa8V3ItM5t-qmikbYQhO3/view?usp=sharing

▼【オーダーメイド式】生成AIパーソナルトレーニング
https://drive.google.com/file/d/1Ks9axZLMnc3lh16pG_BxDSDJbpuQCY-7/view?usp=sharing

▼AX / DX内製化サポート
https://drive.google.com/file/d/1DZ9FqNasdLh6uN2sGkpdc4No05F8-iKb/view?usp=drive_link

▼WEBマーケティングサポート
https://drive.google.com/file/d/1ZA1evKizEijBgdXYUP04eFoKzUM7HFpC/view?usp=sharing

▼デバイス格安販売
https://drive.google.com/file/d/17V3UjCSCy9z8prBEPRxkTMskcrFU8PEO/view?usp=sharing

──────────────

なお、6月末までの期間限定で、
「御社の現場が楽になるAI活用」について意見交換させていただく
1時間の無料コンサルティングをご用意しております。

リフォーム業界において「こんな業務に使えないか」というお困りごとがございましたら、
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
