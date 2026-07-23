/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { logAction } from "@/lib/audit";
import {
  assertCanWriteProceeding,
  proceedingIdForEvent,
  proceedingIdForProceedingDoc,
  proceedingIdForEventDoc,
} from "@/lib/guestProceedingAuth";

export interface AppealInput {
  client_org_id: string;
  financial_year_id?: string;
  assessment_year_id?: string;
  act_regulation_id?: string;
  status?: string;
  litigation_type_id?: string;
}

// Litigation Type is now master-data-driven (nested under an Act, same as
// Proceeding Type) — a client-submitted id can't be trusted blindly since
// createServiceClient() bypasses RLS, so this independently verifies the id
// exists, is active, and belongs to the Act being submitted.
async function assertValidLitigationTypeId(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  id: string | undefined,
  actRegulationId: string | undefined,
  required: boolean,
) {
  if (!id) {
    if (required) throw new Error("Litigation Type is required.");
    return;
  }
  const { data } = await supabase
    .from("master_records")
    .select("id, parent_id, is_active, deleted_at")
    .eq("id", id)
    .eq("type", "litigation_type")
    .maybeSingle();
  if (!data || !data.is_active || data.deleted_at) {
    throw new Error("Invalid Litigation Type.");
  }
  if (actRegulationId && data.parent_id !== actRegulationId) {
    throw new Error("Litigation Type does not belong to the selected Act.");
  }
}

export interface ProceedingContact {
  id: string;
  designation: string;
  name: string;
  mobile: string;
  email: string;
}

export interface ProceedingInput {
  proceeding_type_id?: string;
  authority_type?: string;
  authority_name?: string;
  jurisdiction?: string;
  jurisdiction_city?: string;
  importance?: string;
  mode?: string;
  initiated_on?: string;
  to_be_completed_by?: string;
  assigned_to_ids?: string[];
  client_staff_ids?: string[];
  guest_ids?: string[];
  possible_outcome?: string;
  status?: string;
  gst_number?: string;
  contacts?: ProceedingContact[];
}

export interface EventInput {
  proceeding_id: string;
  event_type: string;        // 'main' | 'sub'
  category: string;
  parent_event_id?: string;  // sub events reference their parent main event
  event_date?: string;
  status?: string;           // 'open' | 'closed'
  event_notice_number?: string;
  description?: string;
  details?: Record<string, string>;
}

function spOnly(role: string) {
  if (!["sp_admin", "sp_staff", "director"].includes(role)) throw new Error("Unauthorized");
}

function cleanProceeding(proc: ProceedingInput) {
  return {
    proceeding_type_id: proc.proceeding_type_id || null,
    authority_type: proc.authority_type || null,
    authority_name: proc.authority_name || null,
    jurisdiction: proc.jurisdiction || null,
    jurisdiction_city: proc.jurisdiction_city || null,
    importance: (proc.importance as "critical" | "high" | "medium" | "low") || null,
    mode: (proc.mode as "online" | "offline") || null,
    initiated_on: proc.initiated_on || null,
    to_be_completed_by: proc.to_be_completed_by || null,
    assigned_to: proc.assigned_to_ids?.[0] || null,
    client_staff_id: proc.client_staff_ids?.[0] || null,
    assigned_to_ids: proc.assigned_to_ids ?? [],
    client_staff_ids: proc.client_staff_ids ?? [],
    guest_ids: proc.guest_ids ?? [],
    possible_outcome: (proc.possible_outcome as "favourable" | "doubtful" | "unfavourable") || null,
    status: proc.status || "open",
    gst_number: proc.gst_number || null,
    contacts: proc.contacts ?? [],
  };
}

const EVENT_CATEGORY_LABELS: Record<string, string> = {
  notice_from_authority: "Notice from Authority",
  show_cause_notice: "Show Cause Notice (SCN)",
  personal_hearing_notice: "Personal Hearing Notice",
  virtual_hearing_notice: "Virtual Hearing Notice",
  assessment_order: "Assessment Order",
  penalty_order: "Penalty Order",
  filing_of_appeal: "Filing of Appeal",
  others: "Others",
  response_to_notice: "Response to Notice",
  adjournment_request: "Adjournment Request",
  personal_follow_up: "Personal Follow-up",
  others_sub: "Others",
};

async function buildAppealLabel(supabase: Awaited<ReturnType<typeof createServiceClient>>, appealId: string): Promise<string> {
  const { data } = await supabase
    .from("appeals")
    .select("client_org:organizations!client_org_id(name), assessment_year:master_records!assessment_year_id(name)")
    .eq("id", appealId)
    .single();
  if (!data) return "Unknown Litigation";
  const client = (data.client_org as any)?.name ?? "";
  const ay = (data.assessment_year as any)?.name ?? "";
  return ay ? `${client} — AY ${ay}` : client || "Unknown";
}

export async function createAppeal(appeal: AppealInput, proceeding: ProceedingInput): Promise<{ appealId: string; proceedingId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  await assertValidLitigationTypeId(supabase, appeal.litigation_type_id, appeal.act_regulation_id, true);

  const { data: newAppeal, error: aErr } = await supabase
    .from("appeals")
    .insert({
      service_provider_id: spId,
      client_org_id: appeal.client_org_id,
      financial_year_id: appeal.financial_year_id || null,
      assessment_year_id: appeal.assessment_year_id || null,
      act_regulation_id: appeal.act_regulation_id || null,
      status: appeal.status || "open",
      litigation_type_id: appeal.litigation_type_id || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (aErr || !newAppeal) throw new Error(aErr?.message ?? "Failed to create appeal");

  const { data: newProceeding, error: pErr } = await supabase.from("proceedings").insert({
    appeal_id: newAppeal.id,
    service_provider_id: spId,
    ...cleanProceeding(proceeding),
  }).select("id").single();

  if (pErr || !newProceeding) throw new Error(pErr?.message ?? "Failed to create proceeding");

  const appealLabel = await buildAppealLabel(supabase, newAppeal.id);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "create", entityType: "appeal", entityLabel: appealLabel });

  revalidatePath("/litigations");
  return { appealId: newAppeal.id, proceedingId: newProceeding.id };
}

export async function updateAppeal(appealId: string, appeal: AppealInput): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const supabase = await createServiceClient();
  await assertValidLitigationTypeId(supabase, appeal.litigation_type_id, appeal.act_regulation_id, false);

  const { error } = await supabase
    .from("appeals")
    .update({
      client_org_id: appeal.client_org_id,
      financial_year_id: appeal.financial_year_id || null,
      assessment_year_id: appeal.assessment_year_id || null,
      act_regulation_id: appeal.act_regulation_id || null,
      status: appeal.status || "open",
      litigation_type_id: appeal.litigation_type_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appealId);

  if (error) throw new Error(error.message);
  const spId = user.service_provider_id ?? user.org_id;
  const appealLabel = await buildAppealLabel(supabase, appealId);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "update", entityType: "appeal", entityLabel: appealLabel });
  revalidatePath(`/litigations/${appealId}`);
  revalidatePath("/litigations");
}

export async function updateProceeding(proceedingId: string, proc: ProceedingInput): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = await createServiceClient();
  await assertCanWriteProceeding(supabase, user, proceedingId);

  const { error } = await supabase
    .from("proceedings")
    .update({ ...cleanProceeding(proc), updated_at: new Date().toISOString() })
    .eq("id", proceedingId);

  if (error) throw new Error(error.message);
  const spId = user.service_provider_id ?? user.org_id;
  const { data: procRef } = await supabase.from("proceedings").select("appeal_id").eq("id", proceedingId).single();
  const procLabel = procRef?.appeal_id ? await buildAppealLabel(supabase, procRef.appeal_id) : proceedingId;
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "update", entityType: "proceeding", entityLabel: procLabel });
  revalidatePath("/litigations");
}

export async function addProceeding(appealId: string, proc: ProceedingInput): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { data, error } = await supabase.from("proceedings").insert({
    appeal_id: appealId,
    service_provider_id: spId,
    ...cleanProceeding(proc),
  }).select("id").single();

  if (error) throw new Error(error.message);
  const procAppealLabel = await buildAppealLabel(supabase, appealId);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "create", entityType: "proceeding", entityLabel: procAppealLabel });
  revalidatePath(`/litigations/${appealId}`);
  revalidatePath("/litigations");
  return data.id;
}

export async function updateEvent(eventId: string, input: EventInput): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = await createServiceClient();
  const evtProceedingId = await proceedingIdForEvent(supabase, eventId);
  await assertCanWriteProceeding(supabase, user, evtProceedingId ?? "");

  const PRIMARY_DATE: Record<string, string> = {
    notice_from_authority: "date_of_notice",
    show_cause_notice: "date_of_notice",
    response_to_notice: "response_submitted_on",
    adjournment_request: "adjourned_to",
    personal_hearing: "hearing_date",
    virtual_hearing: "hearing_date",
    personal_follow_up: "against_notice_dated",
    assessment_order: "date_of_order",
    notice_of_penalty: "date_of_notice",
    penalty_order: "date_of_order",
  };
  const primaryKey = PRIMARY_DATE[input.category];
  const primaryDate =
    primaryKey && input.details?.[primaryKey]
      ? new Date(input.details[primaryKey]).toISOString()
      : input.event_date || null;

  const { error } = await supabase
    .from("events")
    .update({
      category: input.category,
      event_date: primaryDate,
      event_type: input.event_type || "main",
      parent_event_id: input.parent_event_id ?? null,
      status: input.status || "open",
      event_notice_number: input.event_notice_number || null,
      description: input.description || null,
      details: input.details ?? {},
    })
    .eq("id", eventId);

  if (error) throw new Error(error.message);
  const spId = user.service_provider_id ?? user.org_id;
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "update", entityType: "event", entityLabel: EVENT_CATEGORY_LABELS[input.category] ?? input.category });
  revalidatePath("/litigations");
}

export async function addEvent(input: EventInput): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  await assertCanWriteProceeding(supabase, user, input.proceeding_id);

  const { data, error } = await supabase.from("events").insert({
    proceeding_id: input.proceeding_id,
    service_provider_id: spId,
    event_type: input.event_type || "main",
    category: input.category,
    parent_event_id: input.parent_event_id || null,
    event_date: input.event_date || null,
    status: input.status || "open",
    event_notice_number: input.event_notice_number || null,
    description: input.description || null,
    details: input.details ?? {},
    created_by: user.id,
  }).select("id").single();

  if (error) throw new Error(error.message);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "create", entityType: "event", entityLabel: EVENT_CATEGORY_LABELS[input.category] ?? input.category });
  revalidatePath("/litigations");
  return data.id;
}

export async function deleteProceeding(proceedingId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  await assertCanWriteProceeding(supabase, user, proceedingId);

  // Fetch label before cascade so we can record it in the log
  const { data: delProcRef } = await supabase.from("proceedings").select("appeal_id").eq("id", proceedingId).single();
  const delProcLabel = delProcRef?.appeal_id ? await buildAppealLabel(supabase, delProcRef.appeal_id) : proceedingId;

  // Get event IDs for cascade
  const { data: events } = await supabase
    .from("events")
    .select("id")
    .eq("proceeding_id", proceedingId);

  if (events?.length) {
    const evtIds = events.map((e) => e.id);
    await supabase.from("event_documents").delete().in("event_id", evtIds);
    await supabase.from("events").delete().in("id", evtIds);
  }

  await supabase.from("proceeding_documents").delete().eq("proceeding_id", proceedingId);

  const { error } = await supabase.from("proceedings").delete().eq("id", proceedingId);
  if (error) throw new Error(error.message);

  await logAction(supabase, { actorId: user.id, spId: spId!, action: "delete", entityType: "proceeding", entityLabel: delProcLabel });
  revalidatePath("/litigations");
}

export async function deleteEvent(eventId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  const delEvtProceedingId = await proceedingIdForEvent(supabase, eventId);
  await assertCanWriteProceeding(supabase, user, delEvtProceedingId ?? "");

  const { data: evtRef } = await supabase.from("events").select("category").eq("id", eventId).single();
  const evtLabel = evtRef?.category ? EVENT_CATEGORY_LABELS[evtRef.category] ?? evtRef.category : eventId;

  // Delete child sub-events first (FK: events.parent_event_id → events.id)
  const { data: subEvents } = await supabase.from("events").select("id").eq("parent_event_id", eventId);
  if (subEvents && subEvents.length > 0) {
    const subIds = subEvents.map(e => e.id);
    await supabase.from("event_documents").delete().in("event_id", subIds);
    await supabase.from("events").delete().in("id", subIds);
  }

  // Delete this event's documents, then the event itself
  await supabase.from("event_documents").delete().eq("event_id", eventId);
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);

  await logAction(supabase, { actorId: user.id, spId: spId!, action: "delete", entityType: "event", entityLabel: evtLabel });
  revalidatePath("/litigations");
}

export async function deleteAppeal(appealId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const delAppealLabel = await buildAppealLabel(supabase, appealId);

  const { data: proceedings } = await supabase
    .from("proceedings")
    .select("id")
    .eq("appeal_id", appealId);

  if (proceedings?.length) {
    const procIds = proceedings.map((p) => p.id);

    const { data: events } = await supabase
      .from("events")
      .select("id")
      .in("proceeding_id", procIds);

    if (events?.length) {
      const evtIds = events.map((e) => e.id);
      await supabase.from("event_documents").delete().in("event_id", evtIds);
      await supabase.from("events").delete().in("id", evtIds);
    }

    await supabase.from("proceeding_documents").delete().in("proceeding_id", procIds);
    await supabase.from("proceedings").delete().in("id", procIds);
  }

  // Legacy appeal_documents (kept for any existing data)
  await supabase.from("appeal_documents").delete().eq("appeal_id", appealId);

  const { error } = await supabase.from("appeals").delete().eq("id", appealId);
  if (error) throw new Error("Failed to delete appeal: " + error.message);

  await logAction(supabase, { actorId: user.id, spId: spId!, action: "delete", entityType: "appeal", entityLabel: delAppealLabel });
  revalidatePath("/litigations");
  revalidatePath(`/litigations/${appealId}`);
}

// ── Proceeding Documents ─────────────────────────────────────────

export async function uploadProceedingDocument(
  proceedingId: string,
  fileName: string,
  fileUrl: string,
  fileSize: number,
  description?: string,
): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  await assertCanWriteProceeding(supabase, user, proceedingId);

  const { data, error } = await supabase.from("proceeding_documents").insert({
    proceeding_id: proceedingId,
    service_provider_id: spId,
    file_name: fileName,
    file_url: fileUrl,
    file_size: fileSize,
    uploaded_by: user.id,
    description: description || null,
  }).select("id").single();

  if (error) throw new Error(error.message);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "create", entityType: "document", entityLabel: fileName });
  revalidatePath("/litigations");
  return data.id;
}

export async function deleteProceedingDocument(docId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  const docProceedingId = await proceedingIdForProceedingDoc(supabase, docId);
  await assertCanWriteProceeding(supabase, user, docProceedingId ?? "");

  const { data: docRef } = await supabase.from("proceeding_documents").select("file_name").eq("id", docId).single();

  const { error } = await supabase
    .from("proceeding_documents")
    .delete()
    .eq("id", docId);

  if (error) throw new Error(error.message);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "delete", entityType: "document", entityLabel: docRef?.file_name ?? docId });
  revalidatePath("/litigations");
}

// ── Event Documents ──────────────────────────────────────────────

export async function uploadEventDocument(
  eventId: string,
  fileName: string,
  fileUrl: string,
  fileSize: number,
  description?: string,
): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  const evtDocProceedingId = await proceedingIdForEvent(supabase, eventId);
  await assertCanWriteProceeding(supabase, user, evtDocProceedingId ?? "");

  const { data, error } = await supabase.from("event_documents").insert({
    event_id: eventId,
    service_provider_id: spId,
    file_name: fileName,
    file_url: fileUrl,
    file_size: fileSize,
    uploaded_by: user.id,
    description: description || null,
  }).select("id").single();

  if (error) throw new Error(error.message);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "create", entityType: "document", entityLabel: fileName });
  revalidatePath("/litigations");
  return data.id;
}

export async function deleteEventDocument(docId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();
  const evtDocProceedingId = await proceedingIdForEventDoc(supabase, docId);
  await assertCanWriteProceeding(supabase, user, evtDocProceedingId ?? "");

  const { data: evtDocRef } = await supabase.from("event_documents").select("file_name").eq("id", docId).single();

  const { error } = await supabase
    .from("event_documents")
    .delete()
    .eq("id", docId);

  if (error) throw new Error(error.message);
  await logAction(supabase, { actorId: user.id, spId: spId!, action: "delete", entityType: "document", entityLabel: evtDocRef?.file_name ?? docId });
  revalidatePath("/litigations");
}

// ── Report Export ────────────────────────────────────────────────

export interface LitigationReportFilters {
  filterClients:  string[];
  filterActs:     string[];
  filterFYs:      string[];
  filterAYs:      string[];
  filterStatuses: string[];
  filterAssigned: string[];
  filterLitigationTypes: string[];
}

export interface ReportAppeal {
  id: string;
  client_name: string;
  act_name: string;
  financial_year: string;
  assessment_year: string;
  status: string;
  created_at: string;
}

export interface ReportProceeding {
  id: string;
  appeal_id: string;
  client_name: string;
  proceeding_type: string;
  authority_type: string;
  authority_name: string;
  jurisdiction: string;
  jurisdiction_city: string;
  importance: string;
  mode: string;
  initiated_on: string;
  to_be_completed_by: string;
  assigned_names: string;
  possible_outcome: string;
  status: string;
}

export interface ReportEvent {
  id: string;
  proceeding_id: string;
  appeal_id: string;
  client_name: string;
  event_type: string;
  parent_event_id: string | null;
  category: string;
  event_date: string;
  event_notice_number: string;
  description: string;
  status: string;
  details: Record<string, string>;
}

export interface ReportDocument {
  id: string;
  parent_id: string;  // proceeding_id or event_id
  file_name: string;
  description: string;
}

export interface LitigationReportData {
  spName:              string;
  appeals:             ReportAppeal[];
  proceedings:         ReportProceeding[];
  events:              ReportEvent[];
  proceedingDocuments: ReportDocument[];
  eventDocuments:      ReportDocument[];
  generatedAt:         string;
}

const REPORT_APPEAL_SELECT = `
  id, status, created_at,
  act_regulation:master_records!act_regulation_id(id, name),
  financial_year:master_records!financial_year_id(id, name),
  assessment_year:master_records!assessment_year_id(id, name),
  client_org:organizations!client_org_id(id, name)
`;

const REPORT_PROCEEDING_SELECT = `
  id, appeal_id, authority_type, authority_name,
  jurisdiction, jurisdiction_city, importance, mode,
  initiated_on, to_be_completed_by,
  assigned_to_ids,
  possible_outcome, status,
  proceeding_type:master_records!proceeding_type_id(id, name)
`;

const REPORT_EVENT_SELECT = `
  id, proceeding_id, event_type, category, parent_event_id,
  event_date, event_notice_number, description, status, details
`;

export async function exportLitigationsReport(
  filters: LitigationReportFilters,
): Promise<LitigationReportData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  // Query 1: Appeals (no pagination, full filtered set)
  let q = supabase
    .from("appeals")
    .select(REPORT_APPEAL_SELECT)
    .eq("service_provider_id", spId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.filterClients.length)  q = q.in("client_org_id", filters.filterClients);
  if (filters.filterActs.length)     q = q.in("act_regulation_id", filters.filterActs);
  if (filters.filterFYs.length)      q = q.in("financial_year_id", filters.filterFYs);
  if (filters.filterAYs.length)      q = q.in("assessment_year_id", filters.filterAYs);
  if (filters.filterStatuses.length) q = q.in("status", filters.filterStatuses);
  if (filters.filterAssigned.length) q = q.in("assigned_to", filters.filterAssigned);
  if (filters.filterLitigationTypes.length) q = q.in("litigation_type_id", filters.filterLitigationTypes);

  const { data: rawAppeals, error: aErr } = await q;
  if (aErr) throw new Error(aErr.message);

  // Fetch SP organisation name
  const { data: spOrg } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", spId!)
    .single();
  const spName = spOrg?.name ?? "";

  if (!rawAppeals || rawAppeals.length === 0) {
    return { spName, appeals: [], proceedings: [], events: [], proceedingDocuments: [], eventDocuments: [], generatedAt: new Date().toISOString() };
  }

  const litigationIds = rawAppeals.map((a: any) => a.id);

  // Query 2: Proceedings
  const { data: rawProceedings, error: pErr } = await supabase
    .from("proceedings")
    .select(REPORT_PROCEEDING_SELECT)
    .eq("service_provider_id", spId!)
    .in("appeal_id", litigationIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (pErr) throw new Error(pErr.message);

  const proceedingIds = (rawProceedings ?? []).map((p: any) => p.id);

  // Query 3: Events
  let rawEvents: any[] = [];
  if (proceedingIds.length > 0) {
    const { data: evtData, error: eErr } = await supabase
      .from("events")
      .select(REPORT_EVENT_SELECT)
      .in("proceeding_id", proceedingIds)
      .is("deleted_at", null)
      .order("event_date", { ascending: true, nullsFirst: false });
    if (eErr) throw new Error(eErr.message);
    rawEvents = evtData ?? [];
  }

  const eventIds = rawEvents.map((e: any) => e.id);

  // Query 4: Proceeding documents
  let rawProcDocs: any[] = [];
  if (proceedingIds.length > 0) {
    const { data: pd } = await supabase
      .from("proceeding_documents")
      .select("id, proceeding_id, file_name, description")
      .in("proceeding_id", proceedingIds)
      .is("deleted_at", null);
    rawProcDocs = pd ?? [];
  }

  // Query 5: Event documents
  let rawEventDocs: any[] = [];
  if (eventIds.length > 0) {
    const { data: ed } = await supabase
      .from("event_documents")
      .select("id, event_id, file_name, description")
      .in("event_id", eventIds)
      .is("deleted_at", null);
    rawEventDocs = ed ?? [];
  }

  // Resolve assigned_to_ids → full names
  const allUserIds = [
    ...new Set((rawProceedings ?? []).flatMap((p: any) => p.assigned_to_ids ?? [])),
  ];
  const userNameMap = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: userRows } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .in("id", allUserIds);
    (userRows ?? []).forEach((u: any) => {
      userNameMap.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(" "));
    });
  }

  const appealMap = new Map<string, any>(rawAppeals.map((a: any) => [a.id, a]));

  const appeals: ReportAppeal[] = rawAppeals.map((a: any) => ({
    id: a.id,
    client_name: (a.client_org as any)?.name ?? "",
    act_name: (a.act_regulation as any)?.name ?? "",
    financial_year: (a.financial_year as any)?.name ?? "",
    assessment_year: (a.assessment_year as any)?.name ?? "",
    status: a.status ?? "",
    created_at: a.created_at ?? "",
  }));

  const proceedings: ReportProceeding[] = (rawProceedings ?? []).map((p: any) => {
    const parentAppeal = appealMap.get(p.appeal_id);
    return {
      id: p.id,
      appeal_id: p.appeal_id,
      client_name: (parentAppeal?.client_org as any)?.name ?? "",
      proceeding_type: (p.proceeding_type as any)?.name ?? "",
      authority_type: p.authority_type ?? "",
      authority_name: p.authority_name ?? "",
      jurisdiction: p.jurisdiction ?? "",
      jurisdiction_city: p.jurisdiction_city ?? "",
      importance: p.importance ?? "",
      mode: p.mode ?? "",
      initiated_on: p.initiated_on ?? "",
      to_be_completed_by: p.to_be_completed_by ?? "",
      assigned_names: (p.assigned_to_ids ?? [])
        .map((id: string) => userNameMap.get(id) ?? "")
        .filter(Boolean)
        .join(", "),
      possible_outcome: p.possible_outcome ?? "",
      status: p.status ?? "",
    };
  });

  const procAppealMap = new Map<string, string>(
    (rawProceedings ?? []).map((p: any) => [p.id, p.appeal_id]),
  );

  const events: ReportEvent[] = rawEvents.map((e: any) => {
    const appealId = procAppealMap.get(e.proceeding_id) ?? "";
    const parentAppeal = appealMap.get(appealId);
    return {
      id: e.id,
      proceeding_id: e.proceeding_id,
      appeal_id: appealId,
      client_name: (parentAppeal?.client_org as any)?.name ?? "",
      event_type: e.event_type ?? "",
      parent_event_id: e.parent_event_id ?? null,
      category: e.category ?? "",
      event_date: e.event_date ?? "",
      event_notice_number: e.event_notice_number ?? "",
      description: e.description ?? "",
      status: e.status ?? "",
      details: (e.details ?? {}) as Record<string, string>,
    };
  });

  const proceedingDocuments: ReportDocument[] = rawProcDocs.map((d: any) => ({
    id: d.id,
    parent_id: d.proceeding_id,
    file_name: d.file_name ?? "",
    description: d.description ?? "",
  }));

  const eventDocuments: ReportDocument[] = rawEventDocs.map((d: any) => ({
    id: d.id,
    parent_id: d.event_id,
    file_name: d.file_name ?? "",
    description: d.description ?? "",
  }));

  return {
    spName,
    appeals,
    proceedings,
    events,
    proceedingDocuments,
    eventDocuments,
    generatedAt: new Date().toISOString(),
  };
}

// ── Single-litigation report (all proceedings + events + docs) ────

export async function getLitigationReport(appealId: string): Promise<LitigationReportData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { data: spOrg } = await supabase.from("organizations").select("name").eq("id", spId!).single();
  const spName = spOrg?.name ?? "";

  const { data: rawAppeals, error: aErr } = await supabase
    .from("appeals")
    .select(REPORT_APPEAL_SELECT)
    .eq("id", appealId)
    .eq("service_provider_id", spId!)
    .is("deleted_at", null);
  if (aErr) throw new Error(aErr.message);
  if (!rawAppeals || rawAppeals.length === 0) {
    return { spName, appeals: [], proceedings: [], events: [], proceedingDocuments: [], eventDocuments: [], generatedAt: new Date().toISOString() };
  }

  const { data: rawProceedings } = await supabase
    .from("proceedings")
    .select(REPORT_PROCEEDING_SELECT)
    .eq("appeal_id", appealId)
    .eq("service_provider_id", spId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const proceedingIds = (rawProceedings ?? []).map((p: any) => p.id);

  let rawEvents: any[] = [];
  if (proceedingIds.length > 0) {
    const { data: evtData } = await supabase
      .from("events")
      .select(REPORT_EVENT_SELECT)
      .in("proceeding_id", proceedingIds)
      .is("deleted_at", null)
      .order("event_date", { ascending: true, nullsFirst: false });
    rawEvents = evtData ?? [];
  }

  const eventIds = rawEvents.map((e: any) => e.id);

  let rawProcDocs: any[] = [];
  if (proceedingIds.length > 0) {
    const { data: pd } = await supabase
      .from("proceeding_documents")
      .select("id, proceeding_id, file_name, description")
      .in("proceeding_id", proceedingIds)
      .is("deleted_at", null);
    rawProcDocs = pd ?? [];
  }

  let rawEventDocs: any[] = [];
  if (eventIds.length > 0) {
    const { data: ed } = await supabase
      .from("event_documents")
      .select("id, event_id, file_name, description")
      .in("event_id", eventIds)
      .is("deleted_at", null);
    rawEventDocs = ed ?? [];
  }

  const allUserIds = [...new Set((rawProceedings ?? []).flatMap((p: any) => p.assigned_to_ids ?? []))];
  const userNameMap = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: userRows } = await supabase.from("users").select("id, first_name, last_name").in("id", allUserIds);
    (userRows ?? []).forEach((u: any) => userNameMap.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(" ")));
  }

  const appealMap = new Map<string, any>(rawAppeals.map((a: any) => [a.id, a]));

  const appeals: ReportAppeal[] = rawAppeals.map((a: any) => ({
    id: a.id,
    client_name: (a.client_org as any)?.name ?? "",
    act_name: (a.act_regulation as any)?.name ?? "",
    financial_year: (a.financial_year as any)?.name ?? "",
    assessment_year: (a.assessment_year as any)?.name ?? "",
    status: a.status ?? "",
    created_at: a.created_at ?? "",
  }));

  const proceedings: ReportProceeding[] = (rawProceedings ?? []).map((p: any) => {
    const parentAppeal = appealMap.get(p.appeal_id);
    return {
      id: p.id,
      appeal_id: p.appeal_id,
      client_name: (parentAppeal?.client_org as any)?.name ?? "",
      proceeding_type: (p.proceeding_type as any)?.name ?? "",
      authority_type: p.authority_type ?? "",
      authority_name: p.authority_name ?? "",
      jurisdiction: p.jurisdiction ?? "",
      jurisdiction_city: p.jurisdiction_city ?? "",
      importance: p.importance ?? "",
      mode: p.mode ?? "",
      initiated_on: p.initiated_on ?? "",
      to_be_completed_by: p.to_be_completed_by ?? "",
      assigned_names: (p.assigned_to_ids ?? []).map((id: string) => userNameMap.get(id) ?? "").filter(Boolean).join(", "),
      possible_outcome: p.possible_outcome ?? "",
      status: p.status ?? "",
    };
  });

  const procAppealMap = new Map<string, string>((rawProceedings ?? []).map((p: any) => [p.id, p.appeal_id]));

  const events: ReportEvent[] = rawEvents.map((e: any) => {
    const aid = procAppealMap.get(e.proceeding_id) ?? "";
    const parentAppeal = appealMap.get(aid);
    return {
      id: e.id,
      proceeding_id: e.proceeding_id,
      appeal_id: aid,
      client_name: (parentAppeal?.client_org as any)?.name ?? "",
      event_type: e.event_type ?? "",
      parent_event_id: e.parent_event_id ?? null,
      category: e.category ?? "",
      event_date: e.event_date ?? "",
      event_notice_number: e.event_notice_number ?? "",
      description: e.description ?? "",
      status: e.status ?? "",
      details: (e.details ?? {}) as Record<string, string>,
    };
  });

  const proceedingDocuments: ReportDocument[] = rawProcDocs.map((d: any) => ({ id: d.id, parent_id: d.proceeding_id, file_name: d.file_name ?? "", description: d.description ?? "" }));
  const eventDocuments: ReportDocument[] = rawEventDocs.map((d: any) => ({ id: d.id, parent_id: d.event_id, file_name: d.file_name ?? "", description: d.description ?? "" }));

  return { spName, appeals, proceedings, events, proceedingDocuments, eventDocuments, generatedAt: new Date().toISOString() };
}

// ── Single-proceeding report (parent appeal header + 1 proceeding) ─

export async function getProceedingReport(proceedingId: string): Promise<LitigationReportData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { data: spOrg } = await supabase.from("organizations").select("name").eq("id", spId!).single();
  const spName = spOrg?.name ?? "";

  const { data: rawProc } = await supabase
    .from("proceedings")
    .select(REPORT_PROCEEDING_SELECT)
    .eq("id", proceedingId)
    .eq("service_provider_id", spId!)
    .is("deleted_at", null)
    .single();
  if (!rawProc) return { spName, appeals: [], proceedings: [], events: [], proceedingDocuments: [], eventDocuments: [], generatedAt: new Date().toISOString() };

  const { data: rawAppeals } = await supabase
    .from("appeals")
    .select(REPORT_APPEAL_SELECT)
    .eq("id", (rawProc as any).appeal_id)
    .is("deleted_at", null);

  const { data: rawEvents } = await supabase
    .from("events")
    .select(REPORT_EVENT_SELECT)
    .eq("proceeding_id", proceedingId)
    .is("deleted_at", null)
    .order("event_date", { ascending: true, nullsFirst: false });

  const rawEventsArr: any[] = rawEvents ?? [];
  const eventIds = rawEventsArr.map((e: any) => e.id);

  const { data: procDocsRaw } = await supabase
    .from("proceeding_documents")
    .select("id, proceeding_id, file_name, description")
    .eq("proceeding_id", proceedingId)
    .is("deleted_at", null);

  let rawEventDocs: any[] = [];
  if (eventIds.length > 0) {
    const { data: ed } = await supabase.from("event_documents").select("id, event_id, file_name, description").in("event_id", eventIds).is("deleted_at", null);
    rawEventDocs = ed ?? [];
  }

  const assignedIds: string[] = (rawProc as any).assigned_to_ids ?? [];
  const userNameMap = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: userRows } = await supabase.from("users").select("id, first_name, last_name").in("id", assignedIds);
    (userRows ?? []).forEach((u: any) => userNameMap.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(" ")));
  }

  const rawAppeal = rawAppeals?.[0] as any;
  const appeals: ReportAppeal[] = rawAppeal ? [{
    id: rawAppeal.id,
    client_name: rawAppeal.client_org?.name ?? "",
    act_name: rawAppeal.act_regulation?.name ?? "",
    financial_year: rawAppeal.financial_year?.name ?? "",
    assessment_year: rawAppeal.assessment_year?.name ?? "",
    status: rawAppeal.status ?? "",
    created_at: rawAppeal.created_at ?? "",
  }] : [];

  const proceedings: ReportProceeding[] = [{
    id: (rawProc as any).id,
    appeal_id: (rawProc as any).appeal_id,
    client_name: rawAppeal?.client_org?.name ?? "",
    proceeding_type: (rawProc as any).proceeding_type?.name ?? "",
    authority_type: (rawProc as any).authority_type ?? "",
    authority_name: (rawProc as any).authority_name ?? "",
    jurisdiction: (rawProc as any).jurisdiction ?? "",
    jurisdiction_city: (rawProc as any).jurisdiction_city ?? "",
    importance: (rawProc as any).importance ?? "",
    mode: (rawProc as any).mode ?? "",
    initiated_on: (rawProc as any).initiated_on ?? "",
    to_be_completed_by: (rawProc as any).to_be_completed_by ?? "",
    assigned_names: assignedIds.map((id) => userNameMap.get(id) ?? "").filter(Boolean).join(", "),
    possible_outcome: (rawProc as any).possible_outcome ?? "",
    status: (rawProc as any).status ?? "",
  }];

  const events: ReportEvent[] = rawEventsArr.map((e: any) => ({
    id: e.id,
    proceeding_id: e.proceeding_id,
    appeal_id: (rawProc as any).appeal_id,
    client_name: rawAppeal?.client_org?.name ?? "",
    event_type: e.event_type ?? "",
    parent_event_id: e.parent_event_id ?? null,
    category: e.category ?? "",
    event_date: e.event_date ?? "",
    event_notice_number: e.event_notice_number ?? "",
    description: e.description ?? "",
    status: e.status ?? "",
    details: (e.details ?? {}) as Record<string, string>,
  }));

  const proceedingDocuments: ReportDocument[] = (procDocsRaw ?? []).map((d: any) => ({ id: d.id, parent_id: d.proceeding_id, file_name: d.file_name ?? "", description: d.description ?? "" }));
  const eventDocuments: ReportDocument[] = rawEventDocs.map((d: any) => ({ id: d.id, parent_id: d.event_id, file_name: d.file_name ?? "", description: d.description ?? "" }));

  return { spName, appeals, proceedings, events, proceedingDocuments, eventDocuments, generatedAt: new Date().toISOString() };
}
