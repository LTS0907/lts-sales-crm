'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

const nav = [
  { section: '名刺管理', items: [
    { href: '/contacts', label: '名刺一覧', icon: '👤' },
    { href: '/calendar', label: 'カレンダー', icon: '📅' },
    { href: '/groups', label: 'グループ', icon: '🏢' },
    { href: '/search', label: '検索', icon: '🔍' },
  ]},
  { section: '進捗管理', items: [
    { href: '/progress', label: '進捗', icon: '📈' },
  ]},
  { section: '営業CRM', items: [
    { href: '/crm', label: 'CRMダッシュボード', icon: '📊' },
    { href: '/crm/pipeline', label: 'パイプライン', icon: '🔄' },
    { href: '/crm/emails', label: 'メール管理', icon: '✉️' },
    { href: '/crm/followups', label: 'フォローアップ', icon: '🔔' },
  ]},
  { section: '請求管理', items: [
    { href: '/subscriptions', label: 'サブスク管理', icon: '🔄' },
    { href: '/subscriptions/billing', label: '月次請求', icon: '📄' },
    { href: '/accounts-receivable', label: '売掛金管理', icon: '💰' },
    { href: '/payments', label: '入金・消込', icon: '🏦' },
  ]},
]

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-60 h-full bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <Link href="/" onClick={onClose} className="block p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors">
        <h1 className="text-base font-bold text-gray-900">名刺管理 + CRM</h1>
        <p className="text-xs text-gray-400 mt-0.5">営業支援システム</p>
      </Link>
      <nav className="flex-1 p-3 overflow-y-auto">
        {/* トップページへのリンク */}
        <div className="mb-4">
          <Link href="/" onClick={onClose}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
              pathname === '/'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700'
            }`}>
            <span>🏠</span>トップページ
          </Link>
        </div>
        {nav.map(section => (
          <div key={section.section} className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">{section.section}</p>
            {section.items.map(item => (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                  pathname === item.href || (item.href !== '/crm' && pathname.startsWith(item.href + '/')) || (item.href === '/crm' && pathname === '/crm')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-200 space-y-2">
        <Link href="/contacts/new" onClick={onClose}
          className="flex items-center justify-center gap-1 w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + 名刺を追加
        </Link>
        <LogoutButton />
      </div>
    </aside>
  )
}
