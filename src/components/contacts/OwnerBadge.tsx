/**
 * OwnerBadge — 顧客の担当者を視覚的に表示するバッジ
 *
 * KAZUI    = 龍竹 (青)
 * KABASHIMA = 樺嶋 (黄)
 * SHARED   = 共同 (緑)
 */

export type Owner = 'KAZUI' | 'KABASHIMA' | 'SHARED'

export const OWNER_CONFIG: Record<Owner, {
  label: string
  shortLabel: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
}> = {
  KAZUI: {
    label: '龍竹 一生',
    shortLabel: 'かずい',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    icon: '👤',
  },
  KABASHIMA: {
    label: '樺嶋',
    shortLabel: '樺嶋',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    icon: '🌙',
  },
  SHARED: {
    label: '共同',
    shortLabel: '共同',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    icon: '🤝',
  },
}

export const OWNER_OPTIONS: Array<{ value: Owner; label: string }> = [
  { value: 'KAZUI', label: '👤 龍竹（かずい）' },
  { value: 'KABASHIMA', label: '🌙 樺嶋' },
  { value: 'SHARED', label: '🤝 共同' },
]

export default function OwnerBadge({ owner, size = 'sm' }: {
  owner: Owner | string | null | undefined
  size?: 'xs' | 'sm' | 'md'
}) {
  const normalized: Owner = (owner === 'KABASHIMA' || owner === 'SHARED') ? owner : 'KAZUI'
  const config = OWNER_CONFIG[normalized]

  const sizeClass =
    size === 'xs' ? 'px-1.5 py-0.5 text-xs' :
    size === 'md' ? 'px-3 py-1.5 text-sm' :
    'px-2 py-1 text-xs'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.bgColor} ${config.color} ${config.borderColor} ${sizeClass}`}>
      <span>{config.icon}</span>
      <span>{config.shortLabel}</span>
    </span>
  )
}
