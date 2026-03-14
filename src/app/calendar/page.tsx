'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachHourOfInterval,
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
  isWithinInterval,
  setHours,
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
}

type ViewMode = 'month' | 'week' | 'day'

export default function CalendarPage() {
  const { data: session, status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<GoogleEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('month')

  useEffect(() => {
    if (session?.accessToken) {
      fetchEvents()
    }
  }, [currentDate, session, viewMode])

  const fetchEvents = async () => {
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

  const getEventsForHour = (day: Date, hour: number) =>
    events.filter(e => {
      if (e.allDay) return false
      const eventStart = parseISO(e.start)
      const eventEnd = parseISO(e.end)
      const hourStart = setHours(startOfDay(day), hour)
      const hourEnd = setHours(startOfDay(day), hour + 1)
      return (
        isWithinInterval(hourStart, { start: eventStart, end: eventEnd }) ||
        isWithinInterval(eventStart, { start: hourStart, end: hourEnd })
      )
    })

  const getAllDayEvents = (day: Date) =>
    events.filter(e => {
      if (!e.allDay) return false
      const eventDate = parseISO(e.start)
      return isSameDay(eventDate, day)
    })

  // 未ログイン状態
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
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Googleカレンダー</h1>
          <span className="text-sm text-gray-500">{session.user?.email}</span>
        </div>
        <button
          onClick={() => signOut()}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          ログアウト
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            今日
          </button>
          <button onClick={navigatePrev} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
          <button onClick={navigateNext} className="p-2 hover:bg-gray-100 rounded-lg">→</button>
          <h2 className="font-semibold text-gray-900 ml-2">
            {viewMode === 'day' && format(currentDate, 'yyyy年M月d日（E）', { locale: ja })}
            {viewMode === 'week' && `${format(weekDays[0], 'yyyy年M月d日', { locale: ja })} - ${format(weekDays[6], 'M月d日', { locale: ja })}`}
            {viewMode === 'month' && format(currentDate, 'yyyy年M月', { locale: ja })}
          </h2>
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

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex-shrink-0">
          {error}
          <button onClick={fetchEvents} className="ml-2 underline">再試行</button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">読み込み中...</div>
        </div>
      ) : (
        <>
          {/* Month View */}
          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              getEventsForDay={getEventsForDay}
            />
          )}

          {/* Week View */}
          {viewMode === 'week' && (
            <WeekView
              weekDays={weekDays}
              hours={hours}
              events={events}
              getEventsForHour={getEventsForHour}
              getAllDayEvents={getAllDayEvents}
            />
          )}

          {/* Day View */}
          {viewMode === 'day' && (
            <DayView
              currentDate={currentDate}
              hours={hours}
              events={events}
              getEventsForHour={getEventsForHour}
              getAllDayEvents={getAllDayEvents}
            />
          )}
        </>
      )}
    </div>
  )
}

// Month View Component
function MonthView({ currentDate, events, selectedDate, setSelectedDate, getEventsForDay }: {
  currentDate: Date
  events: GoogleEvent[]
  selectedDate: Date | null
  setSelectedDate: (d: Date | null) => void
  getEventsForDay: (d: Date) => GoogleEvent[]
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
              {dayEvents.slice(0, 3).map(e => (
                <div
                  key={e.id}
                  className={`text-xs truncate rounded px-1 py-0.5 mb-0.5 ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-green-100 text-green-700'
                  }`}
                >
                  {e.allDay ? '' : format(parseISO(e.start), 'HH:mm') + ' '}
                  {e.title}
                </div>
              ))}
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
function WeekView({ weekDays, hours, events, getEventsForHour, getAllDayEvents }: {
  weekDays: Date[]
  hours: number[]
  events: GoogleEvent[]
  getEventsForHour: (d: Date, h: number) => GoogleEvent[]
  getAllDayEvents: (d: Date) => GoogleEvent[]
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
              {allDayEvents.map(e => (
                <a
                  key={e.id}
                  href={e.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs bg-green-100 text-green-700 rounded px-1 py-0.5 truncate hover:bg-green-200"
                >
                  {e.title}
                </a>
              ))}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative">
          {hours.map(hour => (
            <div key={hour} className="flex h-12 border-b border-gray-100">
              <div className="w-16 flex-shrink-0 text-xs text-gray-400 text-right pr-2 -mt-2">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDays.map(day => {
                const hourEvents = getEventsForHour(day, hour)
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 border-l border-gray-100 relative ${
                      isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    {hourEvents.map(e => (
                      <a
                        key={e.id}
                        href={e.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-x-0 mx-0.5 text-xs bg-green-500 text-white rounded px-1 py-0.5 truncate hover:bg-green-600 z-10"
                        style={{ top: 0 }}
                      >
                        {format(parseISO(e.start), 'HH:mm')} {e.title}
                      </a>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Day View Component
function DayView({ currentDate, hours, events, getEventsForHour, getAllDayEvents }: {
  currentDate: Date
  hours: number[]
  events: GoogleEvent[]
  getEventsForHour: (d: Date, h: number) => GoogleEvent[]
  getAllDayEvents: (d: Date) => GoogleEvent[]
}) {
  const allDayEvents = getAllDayEvents(currentDate)

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b border-gray-200 flex-shrink-0 p-2">
          <div className="w-16 flex-shrink-0 text-xs text-gray-400">終日</div>
          <div className="flex-1 flex flex-wrap gap-1">
            {allDayEvents.map(e => (
              <a
                key={e.id}
                href={e.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-green-100 text-green-700 rounded px-2 py-1 hover:bg-green-200"
              >
                {e.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        {hours.map(hour => {
          const hourEvents = getEventsForHour(currentDate, hour)
          return (
            <div key={hour} className="flex h-16 border-b border-gray-100">
              <div className="w-16 flex-shrink-0 text-xs text-gray-400 text-right pr-2 pt-1">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1 border-l border-gray-100 relative">
                {hourEvents.map(e => (
                  <a
                    key={e.id}
                    href={e.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute left-1 right-1 top-1 text-sm bg-green-500 text-white rounded px-2 py-1 hover:bg-green-600"
                  >
                    <span className="font-medium">{format(parseISO(e.start), 'HH:mm')} - {format(parseISO(e.end), 'HH:mm')}</span>
                    <span className="ml-2">{e.title}</span>
                    {e.location && <span className="ml-2 text-green-100">📍 {e.location}</span>}
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
