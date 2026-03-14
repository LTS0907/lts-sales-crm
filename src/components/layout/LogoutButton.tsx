'use client'

import { useSession, signOut } from 'next-auth/react'

export default function LogoutButton() {
  const { data: session } = useSession()

  if (!session) return null

  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="text-xs text-gray-500 truncate mb-1 px-1">
        {session.user?.email}
      </div>
      <button
        onClick={() => signOut()}
        className="flex items-center justify-center gap-1 w-full px-3 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
      >
        ログアウト
      </button>
    </div>
  )
}
