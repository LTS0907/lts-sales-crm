'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import TaskPanel from './TaskPanel'
import SupportButton from '../support/SupportButton'

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Public pages (signing page) - render without sidebar
  if (pathname?.startsWith('/sign')) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* モバイル用ハンバーガーボタン */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden bg-white border border-gray-200 rounded-lg p-2 shadow-sm"
        onClick={() => setSidebarOpen(true)}
        aria-label="メニューを開く"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* モバイル用オーバーレイ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* サイドバー（モバイル時はスライドイン、PC時は常時表示） */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transition-transform duration-300
        md:static md:translate-x-0 md:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* メインコンテンツ（モバイルは上部にハンバーガー分のpaddingを追加） */}
      <main className="flex-1 overflow-auto pt-12 md:pt-0">
        {children}
      </main>

      {/* Google Tasks右パネル */}
      <TaskPanel />

      {/* サポート連絡フローティングボタン（全画面常駐） */}
      <SupportButton />
    </div>
  )
}
