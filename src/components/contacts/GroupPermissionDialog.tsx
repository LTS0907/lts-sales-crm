'use client'
export default function GroupPermissionDialog({ suggestion, onAccept, onDecline }: {
  suggestion: { groupName: string; message: string }
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl text-center">
        <div className="text-3xl mb-3">🏢</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">グループへの追加</h2>
        <p className="text-gray-600 text-sm mb-5">{suggestion.message}</p>
        <div className="flex gap-3">
          <button onClick={onAccept} className="flex-1 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">追加する</button>
          <button onClick={onDecline} className="flex-1 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50">スキップ</button>
        </div>
      </div>
    </div>
  )
}
