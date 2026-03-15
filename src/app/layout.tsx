import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import SessionProvider from '@/components/providers/SessionProvider'

export const metadata: Metadata = {
  title: '名刺管理 + 営業CRM',
  description: '名刺管理・営業パイプライン統合アプリ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="flex h-screen bg-gray-50 overflow-hidden">
        <SessionProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
        </SessionProvider>
      </body>
    </html>
  )
}
