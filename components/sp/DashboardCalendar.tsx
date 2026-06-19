'use client'
import { useState, useEffect } from 'react'
import type { CalendarEvent, CalendarEventSourceType } from '@/lib/calendarUtils'
import { loadVisibleTypes, saveVisibleTypes, getWeekDays } from '@/lib/calendarUtils'
import { CalendarMonthGrid } from './CalendarMonthGrid'
import { CalendarWeekGrid } from './CalendarWeekGrid'
import { CalendarUpcomingPanel } from './CalendarUpcomingPanel'
import { CalendarSettingsPanel } from './CalendarSettingsPanel'

interface Props {
  events: CalendarEvent[]
}

type ViewMode = 'month' | 'week'

export function DashboardCalendar({ events }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [visibleTypes, setVisibleTypes] = useState<CalendarEventSourceType[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    setVisibleTypes(loadVisibleTypes())
  }, [])

  function handleVisibleTypesChange(types: CalendarEventSourceType[]) {
    setVisibleTypes(types)
    saveVisibleTypes(types)
  }

  function navPrev() {
    setCurrentDate(prev => {
      const d = new Date(prev)
      if (viewMode === 'month') d.setMonth(d.getMonth() - 1)
      else d.setDate(d.getDate() - 7)
      return d
    })
  }

  function navNext() {
    setCurrentDate(prev => {
      const d = new Date(prev)
      if (viewMode === 'month') d.setMonth(d.getMonth() + 1)
      else d.setDate(d.getDate() + 7)
      return d
    })
  }

  const navLabel = viewMode === 'month'
    ? currentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : (() => {
        const start = getWeekDays(currentDate)[0]
        return `Week of ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
      })()

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Calendar main panel */}
      <div className="flex-1 bg-white border border-border rounded-xl p-4 flex flex-col min-h-[600px] min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={navPrev}
              className="p-1 rounded hover:bg-surface-hover text-secondary transition"
              aria-label="Previous"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-heading min-w-[180px] text-center select-none">
              {navLabel}
            </span>
            <button
              onClick={navNext}
              className="p-1 rounded hover:bg-surface-hover text-secondary transition"
              aria-label="Next"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Month / Week toggle */}
            <div className="flex bg-surface-hover rounded-lg p-1">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  viewMode === 'month'
                    ? 'bg-white shadow-sm text-heading'
                    : 'text-secondary hover:text-heading'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  viewMode === 'week'
                    ? 'bg-white shadow-sm text-heading'
                    : 'text-secondary hover:text-heading'
                }`}
              >
                Week
              </button>
            </div>

            {/* Settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-secondary transition"
              title="Calendar settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Calendar body */}
        {viewMode === 'month' ? (
          <CalendarMonthGrid
            events={events}
            visibleTypes={visibleTypes}
            currentDate={currentDate}
          />
        ) : (
          <CalendarWeekGrid
            events={events}
            visibleTypes={visibleTypes}
            currentDate={currentDate}
          />
        )}
      </div>

      {/* Upcoming Events sidebar */}
      <div className="w-72 flex-shrink-0 bg-white border border-border rounded-xl p-4 overflow-hidden flex flex-col">
        <CalendarUpcomingPanel events={events} visibleTypes={visibleTypes} />
      </div>

      {/* Settings overlay */}
      {settingsOpen && (
        <CalendarSettingsPanel
          visibleTypes={visibleTypes}
          onChange={handleVisibleTypesChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
