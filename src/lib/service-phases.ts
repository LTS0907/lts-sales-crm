/* ************************************************************************** */
/*                                                                            */
/*    service-phases.ts                                 :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
export interface PhaseStep {
  key: string
  label: string
  description: string
}

/** 全サービス共通の最初の2フェーズ */
const COMMON_PHASES: PhaseStep[] = [
  {
    key: 'MAIL_SENT',
    label: '名刺交換・メール送信',
    description: '名刺交換後、こちらからメールを送った',
  },
  {
    key: 'INTERESTED',
    label: '興味ありの反応',
    description: '相手から商材への興味・反応があった（返信 or 会話）',
  },
]

/** サービス別フェーズ定義 */
const SERVICE_SPECIFIC: Record<string, PhaseStep[]> = {
  '生成AI活用セミナー': [
    {
      key: 'APPOINTMENT',
      label: '初回アポ調整',
      description: '初回の打ち合わせ日程を調整中',
    },
    {
      key: 'LABOR_CONFIRM',
      label: '社労士の手配確認',
      description: '社労士をこちらで紹介するか、相手が自分で用意するかを確認',
    },
    {
      key: 'SCHEDULE_CONFIRM',
      label: '日程・人数の確認',
      description: 'セミナーをいつ・何人対象で実施するかを確認',
    },
    {
      key: 'CONTRACTED',
      label: '契約',
      description: '契約締結完了',
    },
    {
      key: 'STARTED',
      label: '授業開始',
      description: 'セミナー・授業を開始した',
    },
  ],
  'AIパーソナルトレーニング': [
    {
      key: 'APPOINTMENT',
      label: '初回アポ調整',
      description: '初回の打ち合わせ日程を調整中',
    },
    {
      key: 'NEEDS_CONFIRM',
      label: 'ニーズ・目標確認',
      description: '習得したいスキルや目標をヒアリング',
    },
    {
      key: 'PLAN_PROPOSED',
      label: 'プラン提案',
      description: 'トレーニングプランを提案した',
    },
    {
      key: 'CONTRACTED',
      label: '契約',
      description: '契約締結完了',
    },
    {
      key: 'STARTED',
      label: 'トレーニング開始',
      description: 'パーソナルトレーニングを開始した',
    },
  ],
  'IT内製化支援': [
    {
      key: 'APPOINTMENT',
      label: '初回アポ調整',
      description: '初回の打ち合わせ日程を調整中',
    },
    {
      key: 'SURVEY',
      label: '現状ヒアリング',
      description: '現在のIT環境・課題をヒアリング',
    },
    {
      key: 'PLAN_PROPOSED',
      label: '内製化プラン提案',
      description: '内製化の提案内容を提示した',
    },
    {
      key: 'CONTRACTED',
      label: '契約',
      description: '契約締結完了',
    },
    {
      key: 'STARTED',
      label: '支援開始',
      description: '内製化支援を開始した',
    },
  ],
  'マーケティング支援': [
    {
      key: 'APPOINTMENT',
      label: '初回アポ調整',
      description: '初回の打ち合わせ日程を調整中',
    },
    {
      key: 'SURVEY',
      label: '課題ヒアリング',
      description: '現在のマーケティング課題をヒアリング',
    },
    {
      key: 'PLAN_PROPOSED',
      label: '施策提案',
      description: 'マーケティング施策を提案した',
    },
    {
      key: 'CONTRACTED',
      label: '契約',
      description: '契約締結完了',
    },
    {
      key: 'STARTED',
      label: '支援開始',
      description: 'マーケティング支援を開始した',
    },
  ],
  'デバイス販売': [
    {
      key: 'NEEDS_CONFIRM',
      label: '必要台数・スペック確認',
      description: '必要なデバイス台数とスペックをヒアリング',
    },
    {
      key: 'QUOTED',
      label: '見積もり提出',
      description: '見積もりを提出した',
    },
    {
      key: 'CONTRACTED',
      label: '発注確定',
      description: '発注が確定した',
    },
    {
      key: 'DELIVERED',
      label: '納品完了',
      description: 'デバイスを納品した',
    },
  ],
  'その他': [
    {
      key: 'APPOINTMENT',
      label: '初回アポ調整',
      description: '初回の打ち合わせ日程を調整中',
    },
    {
      key: 'NEGOTIATING',
      label: '商談・検討中',
      description: '詳細を検討・交渉中',
    },
    {
      key: 'CONTRACTED',
      label: '契約',
      description: '契約締結完了',
    },
    {
      key: 'STARTED',
      label: '開始',
      description: 'サービスを開始した',
    },
  ],
}

/** 全サービス共通の最終フェーズ */
const COMMON_END_PHASES: PhaseStep[] = [
  {
    key: 'COMPLETED',
    label: 'サービス終了',
    description: 'サービスが完了・終了した',
  },
]

/** サービス名 → 全フェーズ（共通＋サービス別＋終了）を返す */
export function getPhasesForService(serviceName: string): PhaseStep[] {
  const specific = SERVICE_SPECIFIC[serviceName] || SERVICE_SPECIFIC['その他']
  return [...COMMON_PHASES, ...specific, ...COMMON_END_PHASES]
}

/** フェーズキー → インデックス（0始まり）を返す。見つからない場合は -1 */
export function getPhaseIndex(serviceName: string, phaseKey: string): number {
  return getPhasesForService(serviceName).findIndex(p => p.key === phaseKey)
}
