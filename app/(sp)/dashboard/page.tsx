import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/user'
import { redirect } from 'next/navigation'
import { DashboardCalendar } from '@/components/sp/DashboardCalendar'
import type { CalendarEvent } from '@/lib/calendarUtils'
import { EVENT_SOURCE_LABELS } from '@/lib/calendarUtils'

function extractDate(val: string | null | undefined): string | null {
  if (!val) return null
  if (val.includes('T')) {
    const d = new Date(val)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return val.slice(0, 10)
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.service_provider_id) redirect('/platform/dashboard')

  const supabase = await createClient()
  const spId = user.service_provider_id

  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const [{ data: procData, error: procError }, { data: evtData, error: evtError }] = await Promise.all([
    supabase
      .from('proceedings')
      .select(`
        id,
        to_be_completed_by,
        initiated_on,
        appeal:appeals!proceedings_appeal_id_fkey (
          id,
          client_org:organizations!appeals_client_org_id_fkey ( name ),
          act_regulation:master_records!appeals_act_regulation_id_fkey ( name ),
          financial_year:master_records!appeals_financial_year_id_fkey ( name )
        ),
        proceeding_type:master_records!proceedings_proceeding_type_id_fkey ( name )
      `)
      .eq('service_provider_id', spId)
      .is('deleted_at', null)
      .or(
        `and(to_be_completed_by.gte.${yearStart},to_be_completed_by.lte.${yearEnd}),` +
        `and(initiated_on.gte.${yearStart},initiated_on.lte.${yearEnd})`
      ),

    supabase
      .from('events')
      .select(`
        id,
        event_date,
        category,
        proceeding:proceedings!events_proceeding_id_fkey (
          appeal:appeals!proceedings_appeal_id_fkey (
            id,
            client_org:organizations!appeals_client_org_id_fkey ( name ),
            act_regulation:master_records!appeals_act_regulation_id_fkey ( name ),
            financial_year:master_records!appeals_financial_year_id_fkey ( name )
          ),
          proceeding_type:master_records!proceedings_proceeding_type_id_fkey ( name )
        )
      `)
      .eq('service_provider_id', spId)
      .is('deleted_at', null)
      .not('event_date', 'is', null)
      .gte('event_date', yearStart)
      .lte('event_date', yearEnd),
  ])

  if (procError) console.error('[dashboard] proceedings error:', procError.message)
  if (evtError) console.error('[dashboard] events error:', evtError.message)

  function pick<T>(rel: T | T[] | null | undefined): T | null {
    if (!rel) return null
    return Array.isArray(rel) ? (rel[0] ?? null) : rel
  }

  const events: CalendarEvent[] = []

  for (const p of procData ?? []) {
    const appeal = pick(p.appeal as any)
    if (!appeal) continue
    const clientName: string = pick((appeal as any).client_org)?.name ?? ''
    const actName: string = pick((appeal as any).act_regulation)?.name ?? ''
    const fy: string = pick((appeal as any).financial_year)?.name ?? ''
    const pt: string = pick(p.proceeding_type as any)?.name ?? ''
    const appealId: string = (appeal as any).id

    const deadline = extractDate(p.to_be_completed_by as string | null)
    if (deadline) {
      events.push({ id: p.id, appealId, date: deadline, sourceType: 'deadline', label: EVENT_SOURCE_LABELS['deadline'], clientName, proceedingType: pt, actName, financialYear: fy })
    }
    const initiatedOn = extractDate(p.initiated_on as string | null)
    if (initiatedOn) {
      events.push({ id: `${p.id}-initiated`, appealId, date: initiatedOn, sourceType: 'initiated_on', label: EVENT_SOURCE_LABELS['initiated_on'], clientName, proceedingType: pt, actName, financialYear: fy })
    }
  }

  for (const e of evtData ?? []) {
    const date = extractDate(e.event_date as string | null)
    if (!date) continue
    const proc = pick(e.proceeding as any)
    if (!proc) continue
    const appeal = pick((proc as any).appeal)
    if (!appeal) continue
    const clientName: string = pick((appeal as any).client_org)?.name ?? ''
    const actName: string = pick((appeal as any).act_regulation)?.name ?? ''
    const fy: string = pick((appeal as any).financial_year)?.name ?? ''
    const pt: string = pick((proc as any).proceeding_type)?.name ?? ''
    const appealId: string = (appeal as any).id
    const sourceType = e.category as CalendarEvent['sourceType']
    events.push({ id: e.id, appealId, date, sourceType, label: EVENT_SOURCE_LABELS[sourceType] ?? String(e.category), clientName, proceedingType: pt, actName, financialYear: fy })
  }

  const firstName = user.first_name ?? 'there'
  const subtitle = user.role === 'sp_admin'
    ? "Here's an overview of your workspace"
    : "Here's your workload for today"

  return (
    <div className="p-6 flex flex-col gap-4" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="flex-shrink-0">
        <h1 className="text-xl font-bold text-heading">Good morning, {firstName}</h1>
        <p className="text-sm text-secondary">{subtitle}</p>
      </div>
      <div className="flex-1 min-h-0">
        <DashboardCalendar events={events} />
      </div>
    </div>
  )
}
