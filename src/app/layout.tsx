import type { Metadata } from 'next'
import './globals.css'
import LayoutClient from '@/components/layout/LayoutClient'
import SessionProvider from '@/components/providers/SessionProvider'

export const metadata: Metadata = {
  title: '名刺管理 + 営業CRM',
  description: '名刺管理・営業パイプライン統合アプリ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50">
        <SessionProvider>
          <LayoutClient>{children}</LayoutClient>
        </SessionProvider>
      </body>
    </html>
  )
}
