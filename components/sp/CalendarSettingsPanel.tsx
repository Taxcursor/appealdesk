'use client'
import type { CalendarEventSourceType } from '@/lib/calendarUtils'
import { EVENT_SOURCE_LABELS, EVENT_SOURCE_COLORS } from '@/lib/calendarUtils'

const GROUPS: { label: string; types: CalendarEventSourceType[] }[] = [
  { label: 'Proceedings Dates', types: ['deadline', 'initiated_on'] },
  { label: 'Hearings', types: ['personal_hearing', 'virtual_hearing'] },
  { label: 'Notices', types: ['notice_from_authority', 'show_cause_notice', 'notice_of_penalty'] },
  { label: 'Responses & Filings', types: ['response_to_notice', 'filing_of_appeal'] },
  { label: 'Orders', types: ['assessment_order', 'penalty_order'] },
  { label: 'Limitation', types: ['limitation'] },
  { label: 'Other', types: ['adjournment_request', 'personal_follow_up', 'others'] },
]

interface Props {
  visibleTypes: CalendarEventSourceType[]
  onChange: (types: CalendarEventSourceType[]) => void
  onClose: () => void
}

export function CalendarSettingsPanel({ visibleTypes, onChange, onClose }: Props) {
  function toggle(type: CalendarEventSourceType) {
    const next = visibleTypes.includes(type)
      ? visibleTypes.filter(t => t !== type)
      : [...visibleTypes, type]
    onChange(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="mt-16 mr-4 w-72 bg-white border border-border rounded-xl shadow-lg p-5 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-heading">Calendar Settings</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-heading text-xl leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-secondary mb-4">
          Choose which date types appear on the calendar and upcoming events list.
        </p>
        {GROUPS.map(group => (
          <div key={group.label} className="mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              {group.label}
            </p>
            {group.types.map(type => (
              <label key={type} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleTypes.includes(type)}
                  onChange={() => toggle(type)}
                  className="rounded border-border accent-primary"
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: EVENT_SOURCE_COLORS[type] }}
                />
                <span className="text-sm text-secondary">{EVENT_SOURCE_LABELS[type]}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
