'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Participant {
  contactId: string
  contact: { id: string; name: string; photoPath: string | null }
}

interface Meeting {
  id: string
  title: string | null
  date: string
  location: string | null
  notes: string | null
  participants: Participant[]
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showAddMeeting, setShowAddMeeting] = useState(false)
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([])
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    location: '',
    notes: '',
    contactIds: [] as string[],
  })

  useEffect(() => {
    fetchMeetings()
    fetchContacts()
  }, [currentDate])

  const fetchMeetings = async () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    const res = await fetch(`/api/meetings?year=${year}&month=${month}`)
    const data = await res.json()
    setMeetings(data)
  }

  const fetchContacts = async () => {
    const res = await fetch('/api/contacts')
    const data = await res.json()
    setContacts(data)
  }

  const addMeeting = async () => {
    if (!selectedDate) return
    const dateStr = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      12, 0, 0
    ).toISOString()

    await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newMeeting,
        date: dateStr,
      }),
    })

    setNewMeeting({ title: '', location: '', notes: '', contactIds: [] })
    setShowAddMeeting(false)
    fetchMeetings()
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  })

  const startDayOfWeek = getDay(startOfMonth(currentDate))

  const prevMonth = () => {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  const getMeetingsForDay = (day: Date) =>
    meetings.filter(m => isSameDay(new Date(m.date), day))

  const selectedDayMeetings = selectedDate ? getMeetingsForDay(selectedDate) : []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">カレンダー</h1>
        {selectedDate && (
          <button
            onClick={() => setShowAddMeeting(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            + 予定を追加
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
            <h2 className="font-semibold text-gray-900">
              {format(currentDate, 'yyyy年M月', { locale: ja })}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">→</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-400 py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map(day => {
              const dayMeetings = getMeetingsForDay(day)
              const isSelected = selectedDate && isSameDay(day, selectedDate)
              const isToday = isSameDay(day, new Date())

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[60px] p-1 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-sm font-medium block mb-1">
                    {format(day, 'd')}
                  </span>
                  {dayMeetings.slice(0, 2).map(m => (
                    <div
                      key={m.id}
                      className={`text-xs truncate rounded px-1 py-0.5 mb-0.5 ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {m.participants[0]?.contact.name || m.title || '予定'}
                    </div>
                  ))}
                  {dayMeetings.length > 2 && (
                    <div className={`text-xs ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                      +{dayMeetings.length - 2}件
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Day Detail Panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          {selectedDate ? (
            <>
              <h3 className="font-semibold text-gray-900 mb-4">
                {format(selectedDate, 'M月d日（E）', { locale: ja })}
              </h3>
              {selectedDayMeetings.length === 0 ? (
                <p className="text-sm text-gray-400">この日の予定はありません</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayMeetings.map(meeting => (
                    <div key={meeting.id} className="border border-gray-100 rounded-lg p-3">
                      {meeting.title && (
                        <p className="text-sm font-medium text-gray-900 mb-2">{meeting.title}</p>
                      )}
                      {meeting.location && (
                        <p className="text-xs text-gray-500 mb-2">📍 {meeting.location}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {meeting.participants.map(p => (
                          <Link
                            key={p.contactId}
                            href={`/contacts/${p.contactId}`}
                            className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100"
                          >
                            {p.contact.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowAddMeeting(true)}
                className="mt-4 w-full py-2 border-2 border-dashed border-gray-200 text-sm text-gray-400 rounded-lg hover:border-blue-300 hover:text-blue-500 transition-colors"
              >
                + 予定を追加
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              日付をクリックして予定を確認
            </p>
          )}
        </div>
      </div>

      {/* Add Meeting Modal */}
      {showAddMeeting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-4">
              予定を追加 ({selectedDate && format(selectedDate, 'M月d日', { locale: ja })})
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="タイトル（任意）"
                value={newMeeting.title}
                onChange={e => setNewMeeting(m => ({ ...m, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="場所（任意）"
                value={newMeeting.location}
                onChange={e => setNewMeeting(m => ({ ...m, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <label className="block text-xs text-gray-500 mb-1">参加者</label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {contacts.map(c => (
                    <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newMeeting.contactIds.includes(c.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setNewMeeting(m => ({ ...m, contactIds: [...m.contactIds, c.id] }))
                          } else {
                            setNewMeeting(m => ({ ...m, contactIds: m.contactIds.filter(id => id !== c.id) }))
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <textarea
                placeholder="メモ（任意）"
                value={newMeeting.notes}
                onChange={e => setNewMeeting(m => ({ ...m, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={addMeeting}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                追加
              </button>
              <button
                onClick={() => setShowAddMeeting(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
