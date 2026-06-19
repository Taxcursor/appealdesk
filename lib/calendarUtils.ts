export type CalendarEventSourceType =
  | 'deadline'
  | 'initiated_on'
  | 'notice_from_authority'
  | 'show_cause_notice'
  | 'personal_hearing'
  | 'virtual_hearing'
  | 'response_to_notice'
  | 'adjournment_request'
  | 'personal_follow_up'
  | 'assessment_order'
  | 'notice_of_penalty'
  | 'penalty_order'
  | 'filing_of_appeal'
  | 'limitation'
  | 'others'

export interface CalendarEvent {
  id: string
  appealId: string
  date: string  // YYYY-MM-DD
  sourceType: CalendarEventSourceType
  label: string
  clientName: string
  proceedingType: string
  actName: string
  financialYear: string
}

export const EVENT_SOURCE_LABELS: Record<CalendarEventSourceType, string> = {
  deadline: 'Target Date',
  initiated_on: 'Initiated On',
  notice_from_authority: 'Notice from Authority',
  show_cause_notice: 'Show Cause Notice',
  personal_hearing: 'Personal Hearing',
  virtual_hearing: 'Virtual Hearing',
  response_to_notice: 'Response to Notice',
  adjournment_request: 'Adjournment Request',
  personal_follow_up: 'Personal Follow-up',
  assessment_order: 'Assessment Order',
  notice_of_penalty: 'Notice of Penalty',
  penalty_order: 'Penalty Order',
  filing_of_appeal: 'Filing of Appeal',
  limitation: 'Limitation',
  others: 'Others',
}

export const EVENT_SOURCE_COLORS: Record<CalendarEventSourceType, string> = {
  personal_hearing: '#2563EB',
  virtual_hearing: '#2563EB',
  notice_from_authority: '#4A6FA5',
  show_cause_notice: '#4A6FA5',
  notice_of_penalty: '#4A6FA5',
  response_to_notice: '#16A34A',
  filing_of_appeal: '#16A34A',
  assessment_order: '#1E3A5F',
  penalty_order: '#1E3A5F',
  deadline: '#DC2626',
  limitation: '#D97706',
  adjournment_request: '#9CA3AF',
  personal_follow_up: '#9CA3AF',
  others: '#9CA3AF',
  initiated_on: '#9CA3AF',
}

export const ALL_SOURCE_TYPES: CalendarEventSourceType[] = [
  'deadline', 'initiated_on',
  'notice_from_authority', 'show_cause_notice',
  'personal_hearing', 'virtual_hearing',
  'response_to_notice', 'adjournment_request', 'personal_follow_up',
  'assessment_order', 'notice_of_penalty', 'penalty_order',
  'filing_of_appeal', 'limitation', 'others',
]

export const DEFAULT_VISIBLE_TYPES: CalendarEventSourceType[] = [
  'notice_from_authority',
  'show_cause_notice',
  'personal_hearing',
  'virtual_hearing',
  'response_to_notice',
  'deadline',
  'assessment_order',
  'limitation',
]

const SETTINGS_KEY = 'appealdesk_calendar_visible_types'

export function loadVisibleTypes(): CalendarEventSourceType[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE_TYPES
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) return JSON.parse(stored) as CalendarEventSourceType[]
  } catch { /* ignore parse errors */ }
  return DEFAULT_VISIBLE_TYPES
}

export function saveVisibleTypes(types: CalendarEventSourceType[]): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(types))
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const existing = map.get(event.date) ?? []
    map.set(event.date, [...existing, event])
  }
  return map
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

export function getWeekDays(date: Date): Date[] {
  const d = new Date(date)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    return day
  })
}
