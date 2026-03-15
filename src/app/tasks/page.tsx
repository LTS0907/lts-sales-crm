'use client'

export default function TasksPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">タスク</h1>
      <p className="text-sm text-gray-500">
        右側のパネルに全タスクが表示されています。
      </p>
      <p className="text-sm text-gray-400 mt-1">
        Google Tasks「CRM」リストと常に同期しています。
      </p>
    </div>
  )
}
