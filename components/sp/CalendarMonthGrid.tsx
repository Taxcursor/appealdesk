'use client'
import { useRouter } from 'next/navigation'
import type { CalendarEvent, CalendarEventSourceType } from '@/lib/calendarUtils'
import {
  EVENT_SOURCE_COLORS,
  EVENT_SOURCE_LABELS,
  groupEventsByDate,
  getDaysInMonth,
  toDateStr,
} from '@/lib/calendarUtils'

interface Props {
  events: CalendarEvent[]
  visibleTypes: CalendarEventSourceType[]
  currentDate: Date
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarMonthGrid({ events, visibleTypes, currentDate }: Props) {
  const router = useRouter()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = toDateStr(new Date())

  const filtered = events.filter(e => visibleTypes.includes(e.sourceType))
  const byDate = groupEventsByDate(filtered)
  const days = getDaysInMonth(year, month)

  // Monday-start offset: Sun(0)→6, Mon(1)→0, Tue(2)→1, etc.
  const firstDow = new Date(year, month, 1).getDay()
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1

  // One legend entry per distinct colour
  const legendEntries = Array.from(
    visibleTypes.reduce((map, t) => {
      const color = EVENT_SOURCE_COLORS[t]
      if (!map.has(color)) map.set(color, EVENT_SOURCE_LABELS[t])
      return map
    }, new Map<string, string>())
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {legendEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
          {legendEntries.map(([color, label]) => (
            <span key={color} className="flex items-center gap-1 text-xs text-secondary">
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 border-b border-border">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-xs font-semibold text-muted text-center py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 border-l border-t border-border overflow-y-auto">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="border-r border-b border-border bg-surface min-h-[90px]" />
        ))}
        {days.map(day => {
          const dateStr = toDateStr(day)
          const dayEvents = byDate.get(dateStr) ?? []
          const isToday = dateStr === today
          return (
            <div
              key={dateStr}
              className={`border-r border-b border-border min-h-[90px] p-1 ${
                isToday ? 'ring-2 ring-inset ring-accent bg-accent-faint' : ''
              }`}
            >
              <div className={`
                text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1
                ${isToday ? 'bg-primary text-white' : 'text-heading'}
              `}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(event => (
                  <button
                    key={`${event.sourceType}-${event.id}`}
                    onClick={() => router.push(`/litigations/${event.appealId}`)}
                    title={`${EVENT_SOURCE_LABELS[event.sourceType]} — ${event.clientName} · ${event.actName}`}
                    className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white font-medium hover:opacity-80 transition"
                    style={{ background: EVENT_SOURCE_COLORS[event.sourceType] }}
                  >
                    {EVENT_SOURCE_LABELS[event.sourceType]}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-muted pl-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
