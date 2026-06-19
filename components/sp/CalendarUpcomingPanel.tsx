'use client'
import { useRouter } from 'next/navigation'
import type { CalendarEvent, CalendarEventSourceType } from '@/lib/calendarUtils'
import { EVENT_SOURCE_LABELS, EVENT_SOURCE_COLORS, toDateStr } from '@/lib/calendarUtils'

interface Props {
  events: CalendarEvent[]
  visibleTypes: CalendarEventSourceType[]
}

export function CalendarUpcomingPanel({ events, visibleTypes }: Props) {
  const router = useRouter()
  const today = toDateStr(new Date())

  const upcoming = events
    .filter(e => e.date >= today && visibleTypes.includes(e.sourceType))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 50)

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className="text-accent flex-shrink-0"
        >
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <h3 className="text-sm font-semibold text-heading">Upcoming Events</h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {upcoming.length === 0 && (
          <p className="text-xs text-muted py-4 text-center">
            No upcoming events for the selected types.
          </p>
        )}
        {upcoming.map(event => (
          <button
            key={`${event.sourceType}-${event.id}`}
            onClick={() => router.push(`/litigations/${event.appealId}`)}
            className="w-full text-left hover:bg-accent-light rounded-lg p-2 transition group"
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: EVENT_SOURCE_COLORS[event.sourceType] }}
              />
              <div className="min-w-0">
                <p className="text-xs text-muted">{fmtDate(event.date)}</p>
                <p className="text-sm font-semibold text-heading truncate group-hover:text-accent">
                  {EVENT_SOURCE_LABELS[event.sourceType]}
                </p>
                <p className="text-xs text-secondary truncate">
                  {event.clientName} · {event.actName}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
