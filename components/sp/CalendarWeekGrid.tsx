'use client'
import { useRouter } from 'next/navigation'
import type { CalendarEvent, CalendarEventSourceType } from '@/lib/calendarUtils'
import {
  EVENT_SOURCE_COLORS,
  EVENT_SOURCE_LABELS,
  groupEventsByDate,
  getWeekDays,
  toDateStr,
} from '@/lib/calendarUtils'

interface Props {
  events: CalendarEvent[]
  visibleTypes: CalendarEventSourceType[]
  currentDate: Date
}

const COL_BODY_TINTS = [
  '#FFF5F5', '#FFFBEB', '#F0FFF4', '#EFF6FF',
  '#F5F3FF', '#FFF0F6', '#F0FDFA',
]
const COL_HEADER_TINTS = [
  '#FECACA', '#FDE68A', '#BBF7D0', '#BFDBFE',
  '#DDD6FE', '#FBCFE8', '#99F6E4',
]

export function CalendarWeekGrid({ events, visibleTypes, currentDate }: Props) {
  const router = useRouter()
  const today = toDateStr(new Date())
  const weekDays = getWeekDays(currentDate)
  const filtered = events.filter(e => visibleTypes.includes(e.sourceType))
  const byDate = groupEventsByDate(filtered)

  return (
    <div className="grid grid-cols-7 gap-2 flex-1 min-h-[400px]">
      {weekDays.map((day, i) => {
        const dateStr = toDateStr(day)
        const dayEvents = byDate.get(dateStr) ?? []
        const dayName = day.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()
        const dayLabel = day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        const isToday = dateStr === today

        return (
          <div
            key={dateStr}
            className="flex flex-col rounded-lg overflow-hidden border border-border"
          >
            <div
              className="text-center py-2 border-b border-border flex-shrink-0"
              style={{ background: COL_HEADER_TINTS[i] }}
            >
              <p className="text-xs font-bold text-heading">{dayName}</p>
              <p className={`text-xs font-semibold ${isToday ? 'text-primary font-bold' : 'text-secondary'}`}>
                {dayLabel}
              </p>
            </div>
            <div
              className="flex-1 overflow-y-auto p-1.5 space-y-1.5 min-h-[300px]"
              style={{ background: COL_BODY_TINTS[i] }}
            >
              {dayEvents.map(event => (
                <button
                  key={`${event.sourceType}-${event.id}`}
                  onClick={() => router.push(`/litigations/${event.appealId}`)}
                  className="w-full text-left rounded bg-white border border-border text-xs p-2 hover:shadow-sm transition"
                  style={{ borderLeftColor: EVENT_SOURCE_COLORS[event.sourceType], borderLeftWidth: 3 }}
                >
                  <p className="font-semibold text-heading mb-0.5 leading-tight">
                    {EVENT_SOURCE_LABELS[event.sourceType]}
                  </p>
                  <p className="text-secondary truncate">{event.clientName}</p>
                  <p className="text-muted truncate">{event.proceedingType}</p>
                  {event.financialYear && (
                    <p className="text-muted">FY: {event.financialYear}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
