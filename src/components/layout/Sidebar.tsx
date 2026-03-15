'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
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
    { href: '/tasks', label: 'タスク', icon: '✅' },
  ]},
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // ページ遷移時にメニューを閉じる
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // メニュー開いてるときにbodyスクロールを止める
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const sidebarContent = (
    <>
      <Link href="/" className="block p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors">
        <h1 className="text-base font-bold text-gray-900">名刺管理 + CRM</h1>
        <p className="text-xs text-gray-400 mt-0.5">営業支援システム</p>
      </Link>
      <nav className="flex-1 p-3 overflow-y-auto">
        {/* トップページへのリンク */}
        <div className="mb-4">
          <Link href="/"
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
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
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
        <Link href="/contacts/new"
          className="flex items-center justify-center gap-1 w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + 名刺を追加
        </Link>
        <LogoutButton />
        <p className="text-center text-[10px] text-gray-300 pt-1">build: {process.env.NEXT_PUBLIC_BUILD_TIME || '-'}</p>
      </div>
    </>
  )

  return (
    <>
      {/* モバイルヘッダー */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14">
        <button
          onClick={() => setOpen(v => !v)}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-700"
          aria-label="メニュー"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        <span className="text-sm font-bold text-gray-900">名刺管理 + CRM</span>
        <Link href="/contacts/new" className="p-2 -mr-2 text-blue-600 text-sm font-medium">+ 追加</Link>
      </div>

      {/* モバイルオーバーレイ */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40 mt-14"
          onClick={() => setOpen(false)}
        />
      )}

      {/* モバイルドロワー */}
      <aside
        className={`md:hidden fixed top-14 left-0 bottom-0 w-64 bg-white z-50 flex flex-col transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* デスクトップサイドバー（従来通り） */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        {sidebarContent}
      </aside>
    </>
  )
}
