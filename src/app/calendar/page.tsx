'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  getDay,
  isSameDay,
  parseISO,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  setHours,
  setMinutes,
} from 'date-fns'
import { ja } from 'date-fns/locale'

interface GoogleEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
  htmlLink?: string
  allDay: boolean
  calendarId?: string
  calendarName?: string
}

// カレンダーIDに対応する色設定
// 龍竹（ryouchiku）: 青、樺嶋（r.kabashima）: 黄（OwnerBadge と統一）
// "primary" は API が session.user.email でタグするため通常到達しないが、フォールバックとして残す
const BLUE_COLOR = {
  bg: 'bg-blue-500',
  text: 'text-white',
  allDayBg: 'bg-blue-100',
  allDayText: 'text-blue-700',
  hover: 'hover:bg-blue-600',
  dot: 'bg-blue-500',
}
const YELLOW_COLOR = {
  bg: 'bg-yellow-500',
  text: 'text-white',
  allDayBg: 'bg-yellow-100',
  allDayText: 'text-yellow-700',
  hover: 'hover:bg-yellow-600',
  dot: 'bg-yellow-500',
}
const CALENDAR_COLORS: Record<string, { bg: string; text: string; allDayBg: string; allDayText: string; hover: string; dot: string }> = {
  primary: BLUE_COLOR,
  'ryouchiku@life-time-support.com': BLUE_COLOR,
  'r.kabashima@life-time-support.com': YELLOW_COLOR,
}

// カレンダーIDから表示名を返すマッピング（凡例などで使用）
const CALENDAR_DISPLAY_NAMES: Record<string, string> = {
  primary: 'マイカレンダー',
  'r.kabashima@life-time-support.com': '樺嶋',
  'ryouchiku@life-time-support.com': '龍竹',
}

function getCalendarDisplayName(calendarId: string, fallback?: string): string {
  if (CALENDAR_DISPLAY_NAMES[calendarId]) return CALENDAR_DISPLAY_NAMES[calendarId]
  return fallback || calendarId
}

// メールアドレスのローカル部分（@より前）でも引けるようにするルックアップ
function getCalendarColor(calendarId?: string, calendarName?: string) {
  if (!calendarId) return CALENDAR_COLORS.primary
  if (CALENDAR_COLORS[calendarId]) return CALENDAR_COLORS[calendarId]
  // calendarName でも探す
  if (calendarName && CALENDAR_COLORS[calendarName]) return CALENDAR_COLORS[calendarName]
  // primary 以外はすべてオレンジ系
  return {
    bg: 'bg-orange-500',
    text: 'text-white',
    allDayBg: 'bg-orange-100',
    allDayText: 'text-orange-700',
    hover: 'hover:bg-orange-600',
    dot: 'bg-orange-500',
  }
}

// 凡例データを生成（重複なし）
function buildLegend(events: GoogleEvent[]) {
  const seen = new Set<string>()
  const legend: { calendarId: string; calendarName: string }[] = []
  // primary は必ず先頭
  legend.push({ calendarId: 'primary', calendarName: getCalendarDisplayName('primary') })
  seen.add('primary')
  for (const e of events) {
    if (e.calendarId && e.calendarId !== 'primary' && !seen.has(e.calendarId)) {
      seen.add(e.calendarId)
      legend.push({
        calendarId: e.calendarId,
        calendarName: getCalendarDisplayName(e.calendarId, e.calendarName),
      })
    }
  }
  return legend
}

type ViewMode = 'month' | 'week' | 'day'

// Event Edit Modal Component
function EventEditModal({
  event,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
  availableCalendars,
}: {
  event: GoogleEvent
  onClose: () => void
  onSave: (data: Partial<GoogleEvent>) => void
  onDelete: (event: GoogleEvent) => void
  saving: boolean
  deleting: boolean
  availableCalendars: { id: string; name: string }[]
}) {
  const isCreate = !event.id
  const [title, setTitle] = useState(event.title)
  const [calendarId, setCalendarId] = useState(event.calendarId || availableCalendars[0]?.id || 'primary')
  const [startDate, setStartDate] = useState(
    event.allDay ? event.start : format(parseISO(event.start), "yyyy-MM-dd'T'HH:mm")
  )
  const [endDate, setEndDate] = useState(
    event.allDay ? event.end : format(parseISO(event.end), "yyyy-MM-dd'T'HH:mm")
  )
  const [location, setLocation] = useState(event.location || '')
  const [description, setDescription] = useState(event.description || '')
  const [allDay, setAllDay] = useState(event.allDay)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      id: event.id,
      title,
      start: allDay ? startDate : startDate,
      end: allDay ? endDate : endDate,
      location,
      description,
      allDay,
      calendarId,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{isCreate ? '予定を作成' : '予定を編集'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {isCreate && availableCalendars.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                登録先カレンダー
              </label>
              <select
                value={calendarId}
                onChange={e => setCalendarId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {availableCalendars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              タイトル
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={e => setAllDay(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="allDay" className="text-sm text-gray-700">
              終日
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                開始
              </label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? startDate.split('T')[0] : startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                終了
              </label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? endDate.split('T')[0] : endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              場所
            </label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="場所を追加"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              説明
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="説明を追加"
            />
          </div>

          <div className="flex gap-2 pt-2">
            {!isCreate && (
              <button
                type="button"
                onClick={() => onDelete(event)}
                disabled={saving || deleting}
                className="px-3 py-2 border border-red-300 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm"
                title="この予定をGoogleカレンダーから削除"
              >
                {deleting ? '削除中...' : '🗑️ 削除'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : isCreate ? '作成' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { data: session, status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<GoogleEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [editingEvent, setEditingEvent] = useState<GoogleEvent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchEvents = useCallback(async () => {
    if (!session?.accessToken) return

    setLoading(true)
    setError(null)
    try {
      let timeMin: Date
      let timeMax: Date

      if (viewMode === 'month') {
        timeMin = startOfMonth(currentDate)
        timeMax = endOfMonth(currentDate)
      } else if (viewMode === 'week') {
        timeMin = startOfWeek(currentDate, { weekStartsOn: 0 })
        timeMax = endOfWeek(currentDate, { weekStartsOn: 0 })
      } else {
        timeMin = startOfDay(currentDate)
        timeMax = endOfDay(currentDate)
      }

      const res = await fetch(
        `/api/google-calendar?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`
      )

      if (!res.ok) {
        throw new Error('カレンダーの取得に失敗しました')
      }

      const data = await res.json()
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken, currentDate, viewMode])

  useEffect(() => {
    if (session?.accessToken) {
      fetchEvents()
    }
  }, [fetchEvents, session?.accessToken])

  // 「+ 予定を作成」用のドラフトイベント生成（次の正時から1時間）
  const openCreateModal = () => {
    const now = new Date()
    const start = new Date(now)
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const fmt = (d: Date) => {
      const tz = d.getTimezoneOffset() * 60000
      return new Date(d.getTime() - tz).toISOString().slice(0, 16)
    }
    setEditingEvent({
      id: '',
      title: '',
      start: fmt(start),
      end: fmt(end),
      allDay: false,
      calendarId: session?.user?.email || 'primary',
    })
  }

  const handleSaveEvent = async (data: Partial<GoogleEvent>) => {
    const isCreate = !data.id
    setSaving(true)
    try {
      const res = await fetch('/api/google-calendar', {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isCreate
            ? {
                title: data.title,
                start: data.start,
                end: data.end,
                location: data.location,
                description: data.description,
                allDay: data.allDay,
                calendarId: data.calendarId,
              }
            : {
                eventId: data.id,
                calendarId: data.calendarId || editingEvent?.calendarId,
                title: data.title,
                start: data.start,
                end: data.end,
                location: data.location,
                description: data.description,
                allDay: data.allDay,
              }
        ),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || (isCreate ? '予定の作成に失敗しました' : '予定の更新に失敗しました'))
      }

      setEditingEvent(null)
      await fetchEvents()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'エラーが発生しました'
      if (message.includes('insufficient') || message.includes('Insufficient Permission')) {
        alert('権限エラー: 一度ログアウトして再ログインしてください。カレンダー編集の権限が必要です。')
      } else {
        alert(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEvent = async (event: GoogleEvent) => {
    if (!event.id) return
    const ok = window.confirm(
      `「${event.title}」を削除します。\n参加者にも削除通知が送信されます。\nよろしいですか？`
    )
    if (!ok) return

    setDeleting(true)
    try {
      const params = new URLSearchParams({ eventId: event.id })
      if (event.calendarId) params.set('calendarId', event.calendarId)
      const res = await fetch(`/api/google-calendar?${params.toString()}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || '予定の削除に失敗しました')
      }
      setEditingEvent(null)
      await fetchEvents()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'エラーが発生しました'
      if (message.includes('insufficient') || message.includes('Insufficient Permission')) {
        alert('権限エラー: 一度ログアウトして再ログインしてください。カレンダー編集の権限が必要です。')
      } else {
        alert(message)
      }
    } finally {
      setDeleting(false)
    }
  }

  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(d => subMonths(d, 1))
    else if (viewMode === 'week') setCurrentDate(d => subWeeks(d, 1))
    else setCurrentDate(d => subDays(d, 1))
  }

  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(d => addMonths(d, 1))
    else if (viewMode === 'week') setCurrentDate(d => addWeeks(d, 1))
    else setCurrentDate(d => addDays(d, 1))
  }

  const goToToday = () => setCurrentDate(new Date())

  const getEventsForDay = (day: Date) =>
    events.filter(e => {
      const eventDate = parseISO(e.start)
      return isSameDay(eventDate, day)
    })

  const getAllDayEvents = (day: Date) =>
    events.filter(e => {
      if (!e.allDay) return false
      const eventDate = parseISO(e.start)
      return isSameDay(eventDate, day)
    })

  const getTimedEventsForDay = (day: Date) =>
    events.filter(e => {
      if (e.allDay) return false
      const eventStart = parseISO(e.start)
      const eventEnd = parseISO(e.end)
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)
      return eventStart < dayEnd && eventEnd > dayStart
    })

  if (status === 'loading') {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-6xl mb-4">📅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Googleカレンダーと連携</h1>
          <p className="text-sm text-gray-500 mb-6">
            Googleアカウントでログインすると、あなたのGoogleカレンダーの予定が表示されます。
          </p>
          <button
            onClick={() => signIn('google')}
            className="inline-flex items-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
          </button>
        </div>
      </div>
    )
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 0 }),
    end: endOfWeek(currentDate, { weekStartsOn: 0 }),
  })

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 whitespace-nowrap">Googleカレンダー</h1>
          <span className="hidden sm:inline text-sm text-gray-500 truncate">{session.user?.email}</span>
        </div>
        <button
          onClick={() => signOut()}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          ログアウト
        </button>
      </div>

      {/* Controls */}
      <div className="mb-4 flex-shrink-0 space-y-2 sm:space-y-0">
        {/* 上段: アクション + ナビ + 表示モード */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={openCreateModal}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
            >
              + 予定を作成
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              今日
            </button>
            <button onClick={navigatePrev} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
            <button onClick={navigateNext} className="p-2 hover:bg-gray-100 rounded-lg">→</button>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'day' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              日
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'week' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              週
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'month' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              月
            </button>
          </div>
        </div>
        {/* 下段: 日付タイトル（独立表示で折り返さない） */}
        <h2 className="font-semibold text-gray-900 mt-2">
          {viewMode === 'day' && format(currentDate, 'yyyy年M月d日（E）', { locale: ja })}
          {viewMode === 'week' && `${format(weekDays[0], 'yyyy年M月d日', { locale: ja })} - ${format(weekDays[6], 'M月d日', { locale: ja })}`}
          {viewMode === 'month' && format(currentDate, 'yyyy年M月', { locale: ja })}
        </h2>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex-shrink-0">
          {error}
          <button onClick={fetchEvents} className="ml-2 underline">再試行</button>
        </div>
      )}

      {/* 凡例 */}
      {events.length > 0 && (
        <div className="flex items-center gap-4 mb-3 flex-shrink-0">
          {buildLegend(events).map(item => {
            const color = getCalendarColor(item.calendarId)
            return (
              <div key={item.calendarId} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${color.dot}`} />
                {item.calendarName}
              </div>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">読み込み中...</div>
        </div>
      ) : (
        <>
          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              getEventsForDay={getEventsForDay}
              onEditEvent={setEditingEvent}
            />
          )}

          {viewMode === 'week' && (
            <WeekView
              weekDays={weekDays}
              hours={hours}
              getAllDayEvents={getAllDayEvents}
              getTimedEventsForDay={getTimedEventsForDay}
              onEditEvent={setEditingEvent}
            />
          )}

          {viewMode === 'day' && (
            <DayView
              currentDate={currentDate}
              hours={hours}
              getAllDayEvents={getAllDayEvents}
              getTimedEventsForDay={getTimedEventsForDay}
              onEditEvent={setEditingEvent}
            />
          )}
        </>
      )}

      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          saving={saving}
          deleting={deleting}
          availableCalendars={[
            { id: session.user?.email || 'primary', name: 'マイカレンダー' },
            ...buildLegend(events)
              .filter(l => l.calendarId !== session.user?.email && l.calendarId !== 'primary')
              .map(l => ({ id: l.calendarId, name: l.calendarName })),
          ]}
        />
      )}
    </div>
  )
}

// Calculate event position and height
function calculateEventStyle(event: GoogleEvent, dayStart: Date): { top: number; height: number } {
  const eventStart = parseISO(event.start)
  const eventEnd = parseISO(event.end)

  const dayStartTime = startOfDay(dayStart)
  const effectiveStart = eventStart < dayStartTime ? dayStartTime : eventStart
  const dayEndTime = endOfDay(dayStart)
  const effectiveEnd = eventEnd > dayEndTime ? dayEndTime : eventEnd

  const startMinutes = differenceInMinutes(effectiveStart, dayStartTime)
  const durationMinutes = differenceInMinutes(effectiveEnd, effectiveStart)

  const hourHeight = 48 // pixels per hour
  const top = (startMinutes / 60) * hourHeight
  const height = Math.max((durationMinutes / 60) * hourHeight, 20) // minimum 20px

  return { top, height }
}

// Month View Component
function MonthView({ currentDate, events, selectedDate, setSelectedDate, getEventsForDay, onEditEvent }: {
  currentDate: Date
  events: GoogleEvent[]
  selectedDate: Date | null
  setSelectedDate: (d: Date | null) => void
  getEventsForDay: (d: Date) => GoogleEvent[]
  onEditEvent: (e: GoogleEvent) => void
}) {
  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  })
  const startDayOfWeek = getDay(startOfMonth(currentDate))

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 overflow-auto">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
          <div key={day} className={`text-center text-xs font-medium py-1 ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
          }`}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map(day => {
          const dayEvents = getEventsForDay(day)
          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const isToday = isSameDay(day, new Date())
          const dayOfWeek = getDay(day)

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={`min-h-[80px] p-1 rounded-lg text-left transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : isToday
                  ? 'bg-blue-50 text-blue-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              <span className={`text-sm font-medium block mb-1 ${
                !isSelected && (dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700')
              }`}>
                {format(day, 'd')}
              </span>
              {dayEvents.slice(0, 3).map(e => {
                const color = getCalendarColor(e.calendarId, e.calendarName)
                return (
                  <div
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onEditEvent(e) }}
                    className={`text-xs truncate rounded px-1 py-0.5 mb-0.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500 text-white hover:bg-blue-400'
                        : `${color.allDayBg} ${color.allDayText} hover:opacity-80`
                    }`}
                  >
                    {e.allDay ? '' : format(parseISO(e.start), 'HH:mm') + ' '}
                    {e.title}
                  </div>
                )
              })}
              {dayEvents.length > 3 && (
                <div className={`text-xs ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                  +{dayEvents.length - 3}件
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Week View Component
function WeekView({ weekDays, hours, getAllDayEvents, getTimedEventsForDay, onEditEvent }: {
  weekDays: Date[]
  hours: number[]
  getAllDayEvents: (d: Date) => GoogleEvent[]
  getTimedEventsForDay: (d: Date) => GoogleEvent[]
  onEditEvent: (e: GoogleEvent) => void
}) {
  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <div className="w-16 flex-shrink-0" />
        {weekDays.map((day, i) => (
          <div
            key={day.toISOString()}
            className={`flex-1 text-center py-2 border-l border-gray-100 ${
              isSameDay(day, new Date()) ? 'bg-blue-50' : ''
            }`}
          >
            <div className={`text-xs ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {format(day, 'E', { locale: ja })}
            </div>
            <div className={`text-lg font-semibold ${
              isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-900'
            }`}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* All-day events */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <div className="w-16 flex-shrink-0 text-xs text-gray-400 p-1">終日</div>
        {weekDays.map(day => {
          const allDayEvents = getAllDayEvents(day)
          return (
            <div key={day.toISOString()} className="flex-1 border-l border-gray-100 p-1 min-h-[30px]">
              {allDayEvents.map(e => {
                const color = getCalendarColor(e.calendarId, e.calendarName)
                return (
                  <button
                    key={e.id}
                    onClick={() => onEditEvent(e)}
                    className={`block w-full text-left text-xs rounded px-1 py-0.5 truncate hover:opacity-80 ${color.allDayBg} ${color.allDayText}`}
                  >
                    {e.title}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative">
          {/* Hour lines */}
          {hours.map(hour => (
            <div key={hour} className="flex h-12 border-b border-gray-100">
              <div className="w-16 flex-shrink-0 text-xs text-gray-400 text-right pr-2 -mt-2">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDays.map(day => (
                <div
                  key={day.toISOString()}
                  className={`flex-1 border-l border-gray-100 ${
                    isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''
                  }`}
                />
              ))}
            </div>
          ))}

          {/* Events overlay */}
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="w-16 flex-shrink-0" />
            {weekDays.map(day => {
              const timedEvents = getTimedEventsForDay(day)
              return (
                <div key={day.toISOString()} className="flex-1 relative border-l border-transparent">
                  {timedEvents.map((e, idx) => {
                    const { top, height } = calculateEventStyle(e, day)
                    const color = getCalendarColor(e.calendarId, e.calendarName)
                    return (
                      <button
                        key={e.id}
                        onClick={() => onEditEvent(e)}
                        className={`absolute left-0.5 right-0.5 text-xs rounded px-1 py-0.5 overflow-hidden pointer-events-auto cursor-pointer shadow-sm ${color.bg} ${color.text} ${color.hover}`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          zIndex: 10 + idx,
                        }}
                      >
                        <div className="font-medium truncate">
                          {format(parseISO(e.start), 'HH:mm')} {e.title}
                        </div>
                        {height > 30 && (
                          <div className="opacity-75 truncate text-[10px]">
                            {format(parseISO(e.start), 'HH:mm')} - {format(parseISO(e.end), 'HH:mm')}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Day View Component
function DayView({ currentDate, hours, getAllDayEvents, getTimedEventsForDay, onEditEvent }: {
  currentDate: Date
  hours: number[]
  getAllDayEvents: (d: Date) => GoogleEvent[]
  getTimedEventsForDay: (d: Date) => GoogleEvent[]
  onEditEvent: (e: GoogleEvent) => void
}) {
  const allDayEvents = getAllDayEvents(currentDate)
  const timedEvents = getTimedEventsForDay(currentDate)

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b border-gray-200 flex-shrink-0 p-2">
          <div className="w-16 flex-shrink-0 text-xs text-gray-400">終日</div>
          <div className="flex-1 flex flex-wrap gap-1">
            {allDayEvents.map(e => {
              const color = getCalendarColor(e.calendarId, e.calendarName)
              return (
                <button
                  key={e.id}
                  onClick={() => onEditEvent(e)}
                  className={`text-xs rounded px-2 py-1 hover:opacity-80 ${color.allDayBg} ${color.allDayText}`}
                >
                  {e.title}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative">
          {/* Hour lines */}
          {hours.map(hour => (
            <div key={hour} className="flex h-12 border-b border-gray-100">
              <div className="w-16 flex-shrink-0 text-xs text-gray-400 text-right pr-2 -mt-2">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1 border-l border-gray-100" />
            </div>
          ))}

          {/* Events overlay */}
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="w-16 flex-shrink-0" />
            <div className="flex-1 relative">
              {timedEvents.map((e, idx) => {
                const { top, height } = calculateEventStyle(e, currentDate)
                const color = getCalendarColor(e.calendarId, e.calendarName)
                return (
                  <button
                    key={e.id}
                    onClick={() => onEditEvent(e)}
                    className={`absolute left-1 right-1 text-sm rounded px-2 py-1 overflow-hidden pointer-events-auto cursor-pointer shadow-sm ${color.bg} ${color.text} ${color.hover}`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      zIndex: 10 + idx,
                    }}
                  >
                    <div className="font-medium">
                      {format(parseISO(e.start), 'HH:mm')} - {format(parseISO(e.end), 'HH:mm')}
                      <span className="ml-2">{e.title}</span>
                    </div>
                    {height > 40 && e.location && (
                      <div className="opacity-75 text-xs mt-1">📍 {e.location}</div>
                    )}
                    {height > 60 && e.description && (
                      <div className="opacity-75 text-xs mt-1 line-clamp-2">{e.description}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
