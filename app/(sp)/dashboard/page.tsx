import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/user'
import { redirect } from 'next/navigation'
import { DashboardCalendar } from '@/components/sp/DashboardCalendar'
import { DashboardDonut } from '@/components/sp/DashboardDonut'
import { DashboardBarList } from '@/components/sp/DashboardBarList'
import { DueDateTrackerPanel } from '@/components/sp/DueDateTrackerPanel'
import type { CalendarEvent, ImportanceLevel } from '@/lib/calendarUtils'
import { EVENT_SOURCE_LABELS, IMPORTANCE_COLORS, IMPORTANCE_LABELS } from '@/lib/calendarUtils'
import type { PossibleOutcome } from '@/lib/types'
import { BRAND } from '@/lib/theme'
import {
  GREETING_PREFIX,
  GREETING_SUBTITLE_ADMIN,
  GREETING_SUBTITLE_STAFF,
  GREETING_HEADING_CLS,
  GREETING_SUBTITLE_CLS,
  IMPORTANCE_ORDER,
  OUTCOME_ORDER,
  OUTCOME_LABELS,
  TEAM_WORKLOAD_MAX_ROWS,
  SIDE_COLUMN_WIDTH,
  NOTICE_STATUS_ORDER,
  NOTICE_STATUS_LABELS,
  AUTHORITY_NOTICES_MAX_ROWS,
  DASHBOARD_BOTTOM_ROW_HEIGHT,
  type NoticeStatus,
} from '@/lib/dashboardConfig'

interface NameRel {
  name: string
}

interface AppealRel {
  id: string
  client_org: NameRel | NameRel[] | null
  act_regulation: NameRel | NameRel[] | null
  financial_year: NameRel | NameRel[] | null
}

interface ProcRow {
  id: string
  to_be_completed_by: string | null
  initiated_on: string | null
  importance: string | null
  assigned_to_ids: string[] | null
  appeal: AppealRel | AppealRel[] | null
  proceeding_type: NameRel | NameRel[] | null
}

interface EvtRow {
  id: string
  event_date: string | null
  category: string
  proceeding: (ProcRow & { appeal: AppealRel | AppealRel[] | null }) | (ProcRow & { appeal: AppealRel | AppealRel[] | null })[] | null
}

interface OpenProcAppealRel {
  act_regulation: NameRel | NameRel[] | null
}

interface OpenProcRow {
  id: string
  importance: string | null
  possible_outcome: string | null
  assigned_to_ids: string[] | null
  to_be_completed_by: string | null
  appeal: OpenProcAppealRel | OpenProcAppealRel[] | null
}

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
  if (user.role === 'guest_manager' || user.role === 'guest_user') redirect('/proceedings')
  if (!user.service_provider_id) redirect('/platform/dashboard')

  const supabase = await createClient()
  const spId = user.service_provider_id

  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const [
    { data: procData, error: procError },
    { data: evtData, error: evtError },
    { data: openProcData, error: openProcError },
    { data: teamMembers, error: teamError },
    { data: allProcStatusData, error: allProcStatusError },
  ] = await Promise.all([
    supabase
      .from('proceedings')
      .select(`
        id,
        to_be_completed_by,
        initiated_on,
        importance,
        assigned_to_ids,
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
          importance,
          assigned_to_ids,
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

    // Due Date Tracker / Priority / Outcome / Workload / Authority-wise widgets — all currently open proceedings
    supabase
      .from('proceedings')
      .select(`
        id,
        importance,
        possible_outcome,
        assigned_to_ids,
        to_be_completed_by,
        appeal:appeals!proceedings_appeal_id_fkey (
          act_regulation:master_records!appeals_act_regulation_id_fkey ( name )
        )
      `)
      .eq('service_provider_id', spId)
      .eq('status', 'open')
      .is('deleted_at', null),

    supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('org_id', spId)
      .in('role', ['sp_admin', 'sp_staff'])
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('first_name'),

    // Notice Status Summary — every proceeding regardless of status (open vs closed)
    supabase
      .from('proceedings')
      .select('id, status')
      .eq('service_provider_id', spId)
      .is('deleted_at', null),
  ])

  if (procError) console.error('[dashboard] proceedings error:', procError.message)
  if (evtError) console.error('[dashboard] events error:', evtError.message)
  if (openProcError) console.error('[dashboard] open proceedings error:', openProcError.message)
  if (teamError) console.error('[dashboard] team members error:', teamError.message)
  if (allProcStatusError) console.error('[dashboard] proceeding status error:', allProcStatusError.message)

  function pick<T>(rel: T | T[] | null | undefined): T | null {
    if (!rel) return null
    return Array.isArray(rel) ? (rel[0] ?? null) : rel
  }

  const events: CalendarEvent[] = []

  for (const p of (procData ?? []) as unknown as ProcRow[]) {
    const appeal = pick(p.appeal)
    if (!appeal) continue
    const clientName: string = pick(appeal.client_org)?.name ?? ''
    const actName: string = pick(appeal.act_regulation)?.name ?? ''
    const fy: string = pick(appeal.financial_year)?.name ?? ''
    const pt: string = pick(p.proceeding_type)?.name ?? ''
    const appealId: string = appeal.id
    const importance = (p.importance ?? null) as CalendarEvent['importance']
    const assignedToIds = (p.assigned_to_ids as string[] | null) ?? []

    const deadline = extractDate(p.to_be_completed_by as string | null)
    if (deadline) {
      events.push({ id: p.id, appealId, date: deadline, sourceType: 'deadline', label: EVENT_SOURCE_LABELS['deadline'], clientName, proceedingType: pt, actName, financialYear: fy, importance, assignedToIds })
    }
    const initiatedOn = extractDate(p.initiated_on as string | null)
    if (initiatedOn) {
      events.push({ id: `${p.id}-initiated`, appealId, date: initiatedOn, sourceType: 'initiated_on', label: EVENT_SOURCE_LABELS['initiated_on'], clientName, proceedingType: pt, actName, financialYear: fy, importance, assignedToIds })
    }
  }

  for (const e of (evtData ?? []) as unknown as EvtRow[]) {
    const date = extractDate(e.event_date)
    if (!date) continue
    const proc = pick(e.proceeding)
    if (!proc) continue
    const appeal = pick(proc.appeal)
    if (!appeal) continue
    const clientName: string = pick(appeal.client_org)?.name ?? ''
    const actName: string = pick(appeal.act_regulation)?.name ?? ''
    const fy: string = pick(appeal.financial_year)?.name ?? ''
    const pt: string = pick(proc.proceeding_type)?.name ?? ''
    const appealId: string = appeal.id
    const sourceType = e.category as CalendarEvent['sourceType']
    const importance = (proc.importance ?? null) as CalendarEvent['importance']
    const assignedToIds = proc.assigned_to_ids ?? []
    events.push({ id: e.id, appealId, date, sourceType, label: EVENT_SOURCE_LABELS[sourceType] ?? String(e.category), clientName, proceedingType: pt, actName, financialYear: fy, importance, assignedToIds })
  }

  const firstName = user.first_name ?? 'there'
  const subtitle = user.role === 'sp_admin'
    ? GREETING_SUBTITLE_ADMIN
    : GREETING_SUBTITLE_STAFF

  const openProcs = (openProcData ?? []) as unknown as OpenProcRow[]

  // Due Date Tracker — open proceedings bucketed by days remaining until deadline.
  // Overdue and due-today both land in "Due Today"; anything past 30 days out is
  // not shown in this widget at all.
  function daysUntil(dateStr: string): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [y, m, d] = dateStr.split('-').map(Number)
    const due = new Date(y, m - 1, d)
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }
  let dueToday = 0
  let dueIn7 = 0
  let dueIn30 = 0
  for (const p of openProcs) {
    const deadline = extractDate(p.to_be_completed_by as string | null)
    if (!deadline) continue
    const days = daysUntil(deadline)
    if (days <= 0) dueToday++
    else if (days <= 7) dueIn7++
    else if (days <= 30) dueIn30++
  }

  // Priority Distribution — open proceedings by importance
  const priorityCounts = IMPORTANCE_ORDER.reduce((acc, level) => {
    acc[level] = openProcs.filter((p) => p.importance === level).length
    return acc
  }, {} as Record<ImportanceLevel, number>)

  // Outcome Forecast — open proceedings by possible outcome
  const outcomeCounts = OUTCOME_ORDER.reduce((acc, outcome) => {
    acc[outcome] = openProcs.filter((p) => p.possible_outcome === outcome).length
    return acc
  }, {} as Record<PossibleOutcome, number>)
  const OUTCOME_COLORS: Record<PossibleOutcome, string> = {
    favourable: BRAND.success,
    doubtful: BRAND.warning,
    unfavourable: BRAND.danger,
  }

  // Team Workload — open proceedings assigned per SP staff member
  const workloadByStaff = new Map<string, number>()
  for (const p of openProcs) {
    for (const staffId of (p.assigned_to_ids as string[] | null) ?? []) {
      workloadByStaff.set(staffId, (workloadByStaff.get(staffId) ?? 0) + 1)
    }
  }
  const teamWorkload = (teamMembers ?? [])
    .map((u) => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`.trim(),
      count: workloadByStaff.get(u.id) ?? 0,
    }))
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TEAM_WORKLOAD_MAX_ROWS)

  // Notice Status Summary — all proceedings (any status), bucketed open vs closed
  const allProcs = allProcStatusData ?? []
  const noticeStatusCounts = NOTICE_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = allProcs.filter((p) => p.status === status).length
    return acc
  }, {} as Record<NoticeStatus, number>)
  const NOTICE_STATUS_COLORS: Record<NoticeStatus, string> = {
    open: BRAND.info,
    closed: BRAND.success,
  }

  // Authority-wise Notices — open proceedings grouped by the appeal's Act/Regulation
  const authorityCounts = new Map<string, number>()
  for (const p of openProcs) {
    const appeal = pick(p.appeal)
    const actName: string | null = pick(appeal?.act_regulation ?? null)?.name ?? null
    if (!actName) continue
    authorityCounts.set(actName, (authorityCounts.get(actName) ?? 0) + 1)
  }
  const authorityWiseNotices = Array.from(authorityCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, AUTHORITY_NOTICES_MAX_ROWS)

  return (
    <div className="h-full p-6 flex flex-col gap-4 overflow-hidden">
      <div className="flex-shrink-0">
        <h1 className={GREETING_HEADING_CLS}>{GREETING_PREFIX}, {firstName}</h1>
        <p className={GREETING_SUBTITLE_CLS}>{subtitle}</p>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Row 1 — Calendar + Day Events, and right sidebar */}
        <div className="flex-1 flex gap-4 min-h-0">
          <div className="flex-1 min-w-0 min-h-0">
            <DashboardCalendar events={events} />
          </div>
          <div className={`${SIDE_COLUMN_WIDTH} flex-shrink-0 flex flex-col gap-2 min-h-0`}>
            <div className="flex-1 min-h-0">
              <DueDateTrackerPanel dueToday={dueToday} dueIn7={dueIn7} dueIn30={dueIn30} />
            </div>
            <div className="flex-1 min-h-0">
              <DashboardDonut
                title="Notice Status Summary"
                data={NOTICE_STATUS_ORDER.map((status) => ({
                  label: NOTICE_STATUS_LABELS[status],
                  value: noticeStatusCounts[status],
                  color: NOTICE_STATUS_COLORS[status],
                }))}
              />
            </div>
            <div className="flex-1 min-h-0">
              <DashboardDonut
                title="Priority Distribution"
                data={IMPORTANCE_ORDER.map((level) => ({
                  label: IMPORTANCE_LABELS[level],
                  value: priorityCounts[level],
                  color: IMPORTANCE_COLORS[level],
                }))}
              />
            </div>
          </div>
        </div>

        {/* Row 2 — Outcome Forecast, Team Workload, Authority-wise Notices */}
        <div className={`${DASHBOARD_BOTTOM_ROW_HEIGHT} flex-shrink-0 flex gap-4`}>
          <div className="flex-1 flex gap-4 min-w-0">
            <div className="flex-1 min-w-0">
              <DashboardBarList
                title="Outcome Forecast"
                data={OUTCOME_ORDER.map((outcome) => ({
                  label: OUTCOME_LABELS[outcome],
                  value: outcomeCounts[outcome],
                  color: OUTCOME_COLORS[outcome],
                }))}
              />
            </div>
            <div className="flex-1 min-w-0">
              <DashboardBarList
                title="Team Workload"
                data={teamWorkload.map((w) => ({ label: w.name, value: w.count }))}
                barColorCls="bg-primary"
                emptyLabel="No open proceedings assigned yet."
              />
            </div>
          </div>
          <div className={`${SIDE_COLUMN_WIDTH} flex-shrink-0`}>
            <DashboardBarList
              title="Authority wise Notices"
              data={authorityWiseNotices}
              barColorCls="bg-primary"
              emptyLabel="No open proceedings with an act on file yet."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
