'use client'

export default function TasksPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">タスク</h1>
      <p className="hidden lg:block text-sm text-gray-500">
        右側のパネルに全タスクが表示されています。
      </p>
      <p className="lg:hidden text-sm text-gray-500">
        画面右下の <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs align-middle">✓</span> ボタンをタップしてタスクを表示してください。
      </p>
      <p className="text-sm text-gray-400 mt-1">
        Google Tasks「CRM」リストと常に同期しています。
      </p>
    </div>
  )
}
