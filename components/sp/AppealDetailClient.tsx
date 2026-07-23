"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Replace characters that are invalid or percent-encoded-unsafe in storage paths.
// The display file_name stored in the DB is always the original name.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ── ESC handler stack ─────────────────────────────────────────────
// Last-registered handler wins — inner dialogs intercept ESC before outer modals.
declare global {
  interface Window {
    __escListenerRegistered?: boolean;
  }
}
const _escStack: Array<() => void> = [];
if (typeof window !== "undefined" && !window.__escListenerRegistered) {
  window.__escListenerRegistered = true;
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && _escStack.length > 0)
        _escStack[_escStack.length - 1]();
    },
    true,
  );
}
function useEscHandler(handler: () => void, active: boolean) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!active) return;
    const fn = () => handlerRef.current();
    _escStack.push(fn);
    return () => {
      const i = _escStack.indexOf(fn);
      if (i !== -1) _escStack.splice(i, 1);
    };
  }, [active]);
}

import {
  updateAppeal,
  updateProceeding,
  addProceeding,
  addEvent,
  updateEvent,
  deleteEvent,
  deleteAppeal,
  deleteProceeding,
  uploadProceedingDocument,
  deleteProceedingDocument,
  uploadEventDocument,
  deleteEventDocument,
  getProceedingReport,
  ProceedingInput,
  EventInput,
  ProceedingContact,
} from "@/app/(sp)/litigations/actions";
import {
  getDemandIssues,
  saveDemandIssues,
} from "@/app/(sp)/litigations/demand-actions";
import type { DemandIssue, DemandIssueInput } from "@/lib/types";
import { PendingAttachments } from "@/components/sp/PendingAttachments";

// ─── AY helpers (mirrors AppealForm.tsx) ─────────────────────────
function deriveAYName(fyName: string): string {
  const match = fyName.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const ayStart = parseInt(match[1]) + 1;
  const ayEnd = (parseInt(match[2]) + 1).toString().padStart(2, "0");
  return `${ayStart}-${ayEnd}`;
}
function isAYDisabled(fyName: string): boolean {
  const match = fyName.match(/^(\d{4})/);
  return !!match && parseInt(match[1]) >= 2026;
}
function filterFYForAct(
  fyOptions: { id: string; name: string }[],
  actName: string | undefined,
) {
  if (actName === "The Income-tax Act, 1961") {
    return fyOptions.filter((m) => parseInt(m.name.slice(0, 4)) < 2026);
  }
  if (actName === "The Income-tax Act, 2025") {
    return fyOptions.filter((m) => parseInt(m.name.slice(0, 4)) >= 2026);
  }
  return fyOptions;
}

// ─── Types ───────────────────────────────────────────────────────
interface AttachedFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  description?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

interface AppEvent {
  id: string;
  event_type: string;
  category: string;
  parent_event_id?: string | null;
  event_date: string | null;
  status: string | null;
  event_notice_number: string | null;
  description: string | null;
  details: Record<string, string> | null;
  created_at: string;
  deleted_at?: string | null;
  event_documents?: AttachedFile[];
}

interface Proceeding {
  id: string;
  proceeding_type: { id: string; name: string } | null;
  authority_type: string | null;
  authority_name: string | null;
  jurisdiction: string | null;
  jurisdiction_city: string | null;
  importance: string | null;
  mode: string | null;
  initiated_on: string | null;
  to_be_completed_by: string | null;
  assigned_to_ids: string[] | null;
  client_staff_ids: string[] | null;
  guest_ids: string[] | null;
  possible_outcome: string | null;
  status: string | null;
  is_active: boolean;
  created_at: string;
  deleted_at?: string | null;
  gst_number?: string | null;
  contacts?: ProceedingContact[] | null;
  events: AppEvent[];
  proceeding_documents?: AttachedFile[];
}

interface Appeal {
  id: string;
  act_regulation: { id: string; name: string } | null;
  financial_year: { id: string; name: string } | null;
  assessment_year: { id: string; name: string } | null;
  status: string | null;
  litigation_type: { id: string; name: string } | null;
  client_org: { id: string; name: string } | null;
  proceedings: Proceeding[];
}

type MasterItem = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
};

// Draft demand issue — string fields for form input compatibility
interface DraftDemandIssue {
  linked_event_id: string;
  notice_no: string;
  notice_date: string;
  description: string;
  tax_demanded: string;
  tax_acceptable: string;
  tax_dropped: string;
  tax_remarks: string;
  interest_demanded: string;
  interest_acceptable: string;
  interest_dropped: string;
  interest_remarks: string;
  penalty_demanded: string;
  penalty_acceptable: string;
  penalty_dropped: string;
  penalty_remarks: string;
}
type DemandTypeKey = "tax" | "interest" | "penalty";
const DEMAND_TYPES: { key: DemandTypeKey; label: string }[] = [
  { key: "tax", label: "Tax" },
  { key: "interest", label: "Interest" },
  { key: "penalty", label: "Penalty" },
];
function blankDraftIssue(): DraftDemandIssue {
  return {
    linked_event_id: "",
    notice_no: "",
    notice_date: "",
    description: "",
    tax_demanded: "0",
    tax_acceptable: "0",
    tax_dropped: "0",
    tax_remarks: "",
    interest_demanded: "0",
    interest_acceptable: "0",
    interest_dropped: "0",
    interest_remarks: "",
    penalty_demanded: "0",
    penalty_acceptable: "0",
    penalty_dropped: "0",
    penalty_remarks: "",
  };
}
function toDraftIssue(iss: DemandIssue): DraftDemandIssue {
  return {
    linked_event_id: iss.linked_event_id ?? "",
    notice_no: iss.notice_no,
    notice_date: iss.notice_date ?? "",
    description: iss.description,
    tax_demanded: iss.tax_demanded.toString(),
    tax_acceptable: iss.tax_acceptable.toString(),
    tax_dropped: (iss.tax_dropped ?? 0).toString(),
    tax_remarks: iss.tax_remarks ?? "",
    interest_demanded: iss.interest_demanded.toString(),
    interest_acceptable: iss.interest_acceptable.toString(),
    interest_dropped: (iss.interest_dropped ?? 0).toString(),
    interest_remarks: iss.interest_remarks ?? "",
    penalty_demanded: iss.penalty_demanded.toString(),
    penalty_acceptable: iss.penalty_acceptable.toString(),
    penalty_dropped: (iss.penalty_dropped ?? 0).toString(),
    penalty_remarks: iss.penalty_remarks ?? "",
  };
}
function fromDraftIssue(
  draft: DraftDemandIssue,
  sortOrder: number,
): DemandIssueInput {
  return {
    linked_event_id: draft.linked_event_id || null,
    notice_no: draft.notice_no,
    notice_date: draft.notice_date || null,
    description: draft.description,
    tax_demanded: parseFloat(draft.tax_demanded) || 0,
    tax_acceptable: parseFloat(draft.tax_acceptable) || 0,
    tax_dropped: parseFloat(draft.tax_dropped) || 0,
    tax_remarks: draft.tax_remarks || null,
    interest_demanded: parseFloat(draft.interest_demanded) || 0,
    interest_acceptable: parseFloat(draft.interest_acceptable) || 0,
    interest_dropped: parseFloat(draft.interest_dropped) || 0,
    interest_remarks: draft.interest_remarks || null,
    penalty_demanded: parseFloat(draft.penalty_demanded) || 0,
    penalty_acceptable: parseFloat(draft.penalty_acceptable) || 0,
    penalty_dropped: parseFloat(draft.penalty_dropped) || 0,
    penalty_remarks: draft.penalty_remarks || null,
    sort_order: sortOrder,
  };
}
function getDraftAmount(
  iss: DraftDemandIssue,
  key: DemandTypeKey,
  field: "demanded" | "acceptable" | "dropped",
): string {
  if (key === "tax")
    return field === "demanded"
      ? iss.tax_demanded
      : field === "acceptable"
        ? iss.tax_acceptable
        : iss.tax_dropped;
  if (key === "interest")
    return field === "demanded"
      ? iss.interest_demanded
      : field === "acceptable"
        ? iss.interest_acceptable
        : iss.interest_dropped;
  return field === "demanded"
    ? iss.penalty_demanded
    : field === "acceptable"
      ? iss.penalty_acceptable
      : iss.penalty_dropped;
}
function setDraftAmount(
  iss: DraftDemandIssue,
  key: DemandTypeKey,
  field: "demanded" | "acceptable" | "dropped",
  val: string,
): DraftDemandIssue {
  if (key === "tax")
    return field === "demanded"
      ? { ...iss, tax_demanded: val }
      : field === "acceptable"
        ? { ...iss, tax_acceptable: val }
        : { ...iss, tax_dropped: val };
  if (key === "interest")
    return field === "demanded"
      ? { ...iss, interest_demanded: val }
      : field === "acceptable"
        ? { ...iss, interest_acceptable: val }
        : { ...iss, interest_dropped: val };
  return field === "demanded"
    ? { ...iss, penalty_demanded: val }
    : field === "acceptable"
      ? { ...iss, penalty_acceptable: val }
      : { ...iss, penalty_dropped: val };
}
function getDraftRemarks(iss: DraftDemandIssue, key: DemandTypeKey): string {
  if (key === "tax") return iss.tax_remarks;
  if (key === "interest") return iss.interest_remarks;
  return iss.penalty_remarks;
}
function setDraftRemarks(
  iss: DraftDemandIssue,
  key: DemandTypeKey,
  val: string,
): DraftDemandIssue {
  if (key === "tax") return { ...iss, tax_remarks: val };
  if (key === "interest") return { ...iss, interest_remarks: val };
  return { ...iss, penalty_remarks: val };
}
function fmtInr(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface Props {
  appeal: Appeal;
  clients: { id: string; name: string }[];
  teamMembers: { id: string; first_name: string; last_name: string }[];
  clientUsers: { id: string; first_name: string; last_name: string }[];
  guestUsers: { id: string; first_name: string; last_name: string; role: string }[];
  mastersByType: Record<string, MasterItem[]>;
  canEdit: boolean;
  clientPan?: string;
  clientGstNumbers?: string[];
}

// ─── Event Category Field Config ─────────────────────────────────
type FieldType =
  | "datetime"
  | "date"
  | "text"
  | "textarea"
  | "select"
  | "proceeding_select"
  | "file";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  fullWidth?: boolean;
}

const MAIN_CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  notice_from_authority: [
    { key: "date_of_notice", label: "Notice Date", type: "date" },
    { key: "due_date", label: "Due Date", type: "datetime" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
  show_cause_notice: [
    { key: "date_of_notice", label: "SCN Date", type: "date" },
    { key: "due_date", label: "Due Date", type: "datetime" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
  personal_hearing_notice: [
    { key: "date_of_notice", label: "Notice Date", type: "date" },
    { key: "hearing_date", label: "Hearing Date", type: "datetime" },
  ],
  virtual_hearing_notice: [
    { key: "date_of_notice", label: "Notice Date", type: "date" },
    { key: "hearing_date", label: "Hearing Date", type: "datetime" },
  ],
  assessment_order: [
    { key: "date_of_order", label: "Date of Order", type: "date" },
  ],
  penalty_order: [
    { key: "date_of_order", label: "Date of Order", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
  filing_of_appeal: [
    {
      key: "appeal_against_proceeding",
      label: "Appeal Against Proceeding",
      type: "proceeding_select",
      fullWidth: true,
    },
    { key: "order_date", label: "Order Date", type: "datetime" },
    { key: "due_date", label: "Due Date for Filing Appeal", type: "datetime" },
    {
      key: "target_date_filing",
      label: "Target Date for Filing Appeal",
      type: "datetime",
    },
    { key: "appeal_filed_on", label: "Appeal Filed On", type: "datetime" },
  ],
  cit_a_order: [{ key: "date_of_order", label: "Date of Order", type: "date" }],
  itat_order: [{ key: "date_of_order", label: "Date of Order", type: "date" }],
  high_court_order: [
    { key: "date_of_order", label: "Date of Order", type: "date" },
  ],
  supreme_court_order: [
    { key: "date_of_order", label: "Date of Order", type: "date" },
  ],
  others: [
    { key: "date", label: "Date", type: "date" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
  additional_data_request: [
    {
      key: "mode_of_request",
      label: "Mode of Request",
      type: "select",
      options: [
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
        { value: "visit", label: "Visit" },
      ],
    },
    { key: "request_date", label: "Request Date", type: "date" },
    { key: "due_date", label: "Due Date", type: "datetime" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
};

const SUB_CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  response_to_notice: [
    {
      key: "response_submitted_on",
      label: "Response Submitted On",
      type: "datetime",
    },
  ],
  adjournment_request: [
    { key: "request_date", label: "Request Date", type: "date" },
    { key: "adjourned_to", label: "Adjourned To", type: "datetime" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
  personal_follow_up: [
    { key: "follow_up_with", label: "Follow Up With", type: "text" },
    { key: "follow_up_by", label: "Follow Up By", type: "text" },
    { key: "internal_target_date", label: "Date", type: "datetime" },
  ],
  hearing_proceedings: [
    { key: "hearing_attended_by", label: "Hearing Attended By", type: "text" },
    { key: "attended_date", label: "Attended Date", type: "datetime" },
    { key: "notes", label: "Notes", type: "textarea", fullWidth: true },
  ],
  others_sub: [
    { key: "date", label: "Date", type: "date" },
    {
      key: "internal_target_date",
      label: "Internal Target Date",
      type: "datetime",
    },
  ],
};

const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  ...MAIN_CATEGORY_FIELDS,
  ...SUB_CATEGORY_FIELDS,
};

const PRIMARY_DATE: Record<string, string> = {
  notice_from_authority: "date_of_notice",
  show_cause_notice: "date_of_notice",
  personal_hearing_notice: "date_of_notice",
  virtual_hearing_notice: "date_of_notice",
  assessment_order: "date_of_order",
  penalty_order: "date_of_order",
  filing_of_appeal: "order_date",
  cit_a_order: "date_of_order",
  itat_order: "date_of_order",
  high_court_order: "date_of_order",
  supreme_court_order: "date_of_order",
  others: "date",
  additional_data_request: "request_date",
  response_to_notice: "response_submitted_on",
  adjournment_request: "request_date",
  hearing_proceedings: "attended_date",
  personal_follow_up: "internal_target_date",
  others_sub: "date",
};

const DUE_DATE_KEY: Record<string, string> = {
  notice_from_authority: "due_date",
  show_cause_notice: "due_date",
  penalty_order: "due_date",
  filing_of_appeal: "due_date",
  additional_data_request: "due_date",
  adjournment_request: "adjourned_to",
};

// Maps each main event category → the date field to surface in sub-event parent info panels.
const PARENT_DATE_FIELD: Record<string, { key: string; label: string }> = {
  notice_from_authority: { key: "date_of_notice", label: "Notice Date" },
  show_cause_notice: { key: "date_of_notice", label: "SCN Date" },
  personal_hearing_notice: { key: "date_of_notice", label: "Notice Date" },
  virtual_hearing_notice: { key: "date_of_notice", label: "Notice Date" },
  assessment_order: { key: "date_of_order", label: "Date of Order" },
  penalty_order: { key: "date_of_order", label: "Date of Order" },
  filing_of_appeal: { key: "appeal_filed_on", label: "Appeal Filed On" },
  cit_a_order: { key: "date_of_order", label: "Date of Order" },
  itat_order: { key: "date_of_order", label: "Date of Order" },
  high_court_order: { key: "date_of_order", label: "Date of Order" },
  supreme_court_order: { key: "date_of_order", label: "Date of Order" },
  others: { key: "date", label: "Date" },
  additional_data_request: { key: "request_date", label: "Request Date" },
};

// Label for the Order/Notice Number field, per main-event category. Falls back to "Order Number".
const NOTICE_NUMBER_FIELD_LABEL: Record<string, string> = {
  notice_from_authority: "Notice Number / Document Identification Number (DIN)",
  show_cause_notice: "Notice Number/Document Identification Number",
  personal_hearing_notice: "Document Identification Number",
  virtual_hearing_notice: "Document Identification Number",
  filing_of_appeal: "Document Number",
  additional_data_request: "Document Number",
};

const MAIN_EVENT_LABELS: Record<string, string> = {
  notice_from_authority: "Notice from Authority",
  show_cause_notice: "Show Cause Notice (SCN)",
  personal_hearing_notice: "Personal Hearing Notice",
  virtual_hearing_notice: "Virtual Hearing Notice",
  assessment_order: "Assessment Order",
  penalty_order: "Penalty Order",
  filing_of_appeal: "Filing of Appeal",
  cit_a_order: "CIT(A) Order",
  itat_order: "ITAT Order",
  high_court_order: "High Court Order",
  supreme_court_order: "Supreme Court Order",
  additional_data_request: "Additional Data Request",
  others: "Others",
};

const SUB_EVENT_LABELS: Record<string, string> = {
  response_to_notice: "Response to Notice",
  adjournment_request: "Adjournment Request",
  hearing_proceedings: "Hearing Proceedings",
  personal_follow_up: "Personal Follow-up",
  others_sub: "Others",
};

const EVENT_LABELS: Record<string, string> = {
  ...MAIN_EVENT_LABELS,
  ...SUB_EVENT_LABELS,
};

function getEventLabel(
  category: string,
  details?: Record<string, string> | null,
): string {
  if (
    (category === "others" || category === "others_sub") &&
    details?.category_name?.trim()
  ) {
    return `Others (${details.category_name.trim()})`;
  }
  return EVENT_LABELS[category] ?? category;
}

const EVENT_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-blue-50 text-blue-700" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
};

// ─── Other Constants ──────────────────────────────────────────────
const IMPORTANCE: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-white text-red-700" },
  high: { label: "High", cls: "bg-white text-orange-700" },
  medium: { label: "Medium", cls: "bg-white text-yellow-700" },
  low: { label: "Low", cls: "bg-white text-green-700" },
};
const OUTCOME: Record<string, { label: string; cls: string }> = {
  favourable: { label: "Favourable", cls: "bg-green-100 text-green-700" },
  doubtful: { label: "Doubtful", cls: "bg-yellow-100 text-yellow-700" },
  unfavourable: { label: "Unfavourable", cls: "bg-red-100 text-red-700" },
};
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-white text-blue-700" },
  closed: { label: "Closed", cls: "bg-white text-gray-500" },
};

// ─── Helpers ─────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const hasTime = d.includes("T");
  // Date-only strings (YYYY-MM-DD) are parsed as UTC by JS, causing off-by-one day
  // in non-UTC timezones. Appending T00:00 forces local-time parsing.
  const dt = new Date(hasTime ? d : d + "T00:00");
  const datePart = dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (!hasTime) return datePart;
  return (
    datePart +
    " " +
    dt.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}

const inp =
  "w-full px-3 py-2 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";
const inpErr =
  "w-full px-3 py-2 text-sm border border-danger rounded-lg focus:outline-none focus:ring-1 focus:ring-danger";

function Field({
  label,
  children,
  fullWidth,
  required,
  error,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-secondary mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
// Splits a combined datetime string into separate date+time inputs so the
// time portion never auto-fills with the current time (browser datetime-local quirk).
function DateTimeField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const datePart = value ? value.slice(0, 10) : ""; // "YYYY-MM-DD"
  const timePart = value && value.includes("T") ? value.slice(11, 16) : ""; // "HH:MM"

  function handleDateChange(newDate: string) {
    if (!newDate) {
      onChange("");
      return;
    }
    // Keep existing time if set; otherwise store date only (no defaulting to 00:00)
    onChange(timePart ? `${newDate}T${timePart}` : newDate);
  }

  function handleTimeChange(newTime: string) {
    if (!datePart) return; // require date before time
    // Clearing the time reverts to date-only storage
    onChange(newTime ? `${datePart}T${newTime}` : datePart);
  }

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={datePart}
        onChange={(e) => handleDateChange(e.target.value)}
        className={className ?? inp}
      />
      <input
        type="time"
        value={timePart}
        onChange={(e) => handleTimeChange(e.target.value)}
        className="px-3 py-2 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary w-32 shrink-0"
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  light,
  truncate,
}: {
  label: string;
  value: React.ReactNode;
  light?: boolean;
  truncate?: boolean;
}) {
  const shadow = !light ? { textShadow: "0 0 8px rgba(0,0,0,0.7)" } : undefined;
  return (
    <div className={truncate ? "min-w-0" : undefined}>
      <p
        className={`text-xs mb-0.5 ${light ? "text-muted" : "text-white/70"}`}
        style={shadow}
      >
        {label}
      </p>
      <p
        className={`text-sm ${light ? "text-heading" : "text-white"}${truncate ? " truncate" : ""}`}
        title={truncate && typeof value === "string" ? value : undefined}
        style={shadow}
      >
        {value || "—"}
      </p>
    </div>
  );
}

// ─── Attachment Panels ────────────────────────────────────────────
function AttachmentRow({
  doc,
  onDelete,
  canEdit,
}: {
  doc: AttachedFile;
  onDelete: () => void;
  canEdit: boolean;
}) {
  return (
    <div
      className="grid items-center bg-white hover:bg-surface-hover transition-colors"
      style={{ gridTemplateColumns: "1fr 80px auto" }}
    >
      {/* Filename + description */}
      <div className="flex items-center gap-2 px-4 py-3 min-w-0">
        <svg
          className="w-3.5 h-3.5 text-accent shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <div className="min-w-0">
          <span className="text-xs font-medium text-heading block truncate" title={doc.file_name}>
            {doc.file_name}
          </span>
          {doc.description && (
            <p className="text-xs text-secondary mt-0.5 truncate" title={doc.description}>
              {doc.description}
            </p>
          )}
        </div>
      </div>
      {/* Size — fixed column */}
      <div className="py-3">
        <span className="text-xs text-muted">
          {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : "—"}
        </span>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-0.5 px-4 py-3">
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          title="View file"
          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </a>
        <a
          href={doc.file_url}
          download={doc.file_name}
          title="Download file"
          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </a>
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete file"
            className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ProceedingAttachments({
  proceedingId,
  docs,
  canEdit,
}: {
  proceedingId: string;
  docs: AttachedFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; desc: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AttachedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<AttachedFile[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const serverDocIds = new Set(docs.map((d) => d.id));
  const activeDocs = [
    ...docs.filter((d) => !d.deleted_at && !deletedIds.has(d.id)),
    ...uploadedDocs.filter(
      (d) => !deletedIds.has(d.id) && !serverDocIds.has(d.id),
    ),
  ];

  // When router.refresh() brings back updated docs, drop any uploadedDocs whose IDs
  // are now present in the refreshed prop — prevents rendering them twice.
  useEffect(() => {
    if (uploadedDocs.length === 0) return;
    const serverIds = new Set(docs.map((d) => d.id));
    setUploadedDocs((prev) => prev.filter((d) => !serverIds.has(d.id)));
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEscHandler(() => setConfirmDelete(null), !!confirmDelete);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, desc: "" })),
    ]);
    e.target.value = "";
  }

  function updateDesc(idx: number, desc: string) {
    setPendingFiles((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, desc } : p)),
    );
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadAll() {
    if (!pendingFiles.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const { file, desc } of pendingFiles) {
        const path = `proceeding-docs/${proceedingId}/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { data, error: upErr } = await supabase.storage
          .from("org-files")
          .upload(path, file, { upsert: true });
        if (upErr || !data)
          throw new Error(
            `"${file.name}": ${upErr?.message ?? "Upload failed"}`,
          );
        const { data: urlData } = supabase.storage
          .from("org-files")
          .getPublicUrl(data.path);
        const docId = await uploadProceedingDocument(
          proceedingId,
          file.name,
          urlData.publicUrl,
          file.size,
          desc.trim() || undefined,
        );
        setUploadedDocs((prev) => [
          ...prev,
          {
            id: docId,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            description: desc.trim() || null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setPendingFiles([]);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save attachment.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteProceedingDocument(confirmDelete.id);
      setDeletedIds((prev) => new Set([...prev, confirmDelete.id]));
      setUploadedDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-5 py-4 bg-accent-tint">
      {/* Header — matches Events section style */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
          Attachments ({activeDocs.length})
        </p>
        {canEdit && (
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg transition font-medium">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Choose Files
            <input
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.docx,.doc"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        )}
      </div>

      {error && pendingFiles.length === 0 && (
        <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">
          {error}
        </div>
      )}

      {/* Existing files */}
      {activeDocs.length === 0 && pendingFiles.length === 0 ? (
        <p className="text-xs text-muted">
          {canEdit
            ? "No attachments. Use Choose Files to add files."
            : "No attachments."}
        </p>
      ) : activeDocs.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          {activeDocs.map((doc) => (
            <AttachmentRow
              key={doc.id}
              doc={doc}
              canEdit={canEdit}
              onDelete={() => setConfirmDelete(doc)}
            />
          ))}
        </div>
      ) : null}

      {/* Pending files with description inputs */}
      {pendingFiles.length > 0 && (
        <div
          className={`${activeDocs.length > 0 ? "mt-3" : ""} rounded-lg border border-border bg-white px-4 py-3 space-y-3`}
        >
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">
              {error}
            </div>
          )}
          {pendingFiles.map(({ file, desc }, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <svg
                className="w-3.5 h-3.5 text-accent shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="text-xs text-heading font-medium truncate w-32 shrink-0" title={file.name}>
                {file.name}
              </span>
              <input
                type="text"
                placeholder="Description (optional)"
                value={desc}
                onChange={(e) => updateDesc(idx, e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
              <button
                type="button"
                onClick={() => removePending(idx)}
                className="p-1 text-muted hover:text-red-500 transition shrink-0"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleUploadAll}
              disabled={uploading}
              className="px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg font-medium disabled:opacity-50"
            >
              {uploading
                ? "Uploading…"
                : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingFiles([]);
                setError(null);
              }}
              className="px-3 py-1.5 text-xs border border-border rounded-lg text-secondary hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">
              Delete Attachment?
            </h3>
            <p className="text-sm text-secondary mb-5">
              Delete <strong>&quot;{confirmDelete.file_name}&quot;</strong>?
              This will move it to trash.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventAttachments({
  eventId,
  docs,
  canEdit,
}: {
  eventId: string;
  docs: AttachedFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; desc: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AttachedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<AttachedFile[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const serverDocIds = new Set(docs.map((d) => d.id));
  const activeDocs = [
    ...docs.filter((d) => !d.deleted_at && !deletedIds.has(d.id)),
    ...uploadedDocs.filter(
      (d) => !deletedIds.has(d.id) && !serverDocIds.has(d.id),
    ),
  ];

  useEffect(() => {
    if (uploadedDocs.length === 0) return;
    const serverIds = new Set(docs.map((d) => d.id));
    setUploadedDocs((prev) => prev.filter((d) => !serverIds.has(d.id)));
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEscHandler(() => setConfirmDelete(null), !!confirmDelete);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, desc: "" })),
    ]);
    e.target.value = "";
  }

  function updateDesc(idx: number, desc: string) {
    setPendingFiles((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, desc } : p)),
    );
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadAll() {
    if (!pendingFiles.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const { file, desc } of pendingFiles) {
        const path = `event-docs/${eventId}/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { data, error: upErr } = await supabase.storage
          .from("org-files")
          .upload(path, file, { upsert: true });
        if (upErr || !data)
          throw new Error(
            `"${file.name}": ${upErr?.message ?? "Upload failed"}`,
          );
        const { data: urlData } = supabase.storage
          .from("org-files")
          .getPublicUrl(data.path);
        const docId = await uploadEventDocument(
          eventId,
          file.name,
          urlData.publicUrl,
          file.size,
          desc.trim() || undefined,
        );
        setUploadedDocs((prev) => [
          ...prev,
          {
            id: docId,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            description: desc.trim() || null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setPendingFiles([]);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save attachment.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteEventDocument(confirmDelete.id);
      setDeletedIds((prev) => new Set([...prev, confirmDelete.id]));
      setUploadedDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 bg-page flex items-center justify-between border-b border-border">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
            Attachments ({activeDocs.length})
          </span>
          {canEdit && (
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-border bg-white rounded-lg text-secondary hover:bg-page transition">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Choose Files
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.docx,.doc"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          )}
        </div>

        {/* Existing files */}
        {error && pendingFiles.length === 0 && (
          <div className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-100">
            {error}
          </div>
        )}
        {activeDocs.length === 0 && pendingFiles.length === 0 ? (
          <div className="px-4 py-3 text-center text-xs text-muted">
            No attachments.{canEdit ? " Use Choose Files to add files." : ""}
          </div>
        ) : activeDocs.length > 0 ? (
          <div className="divide-y divide-surface-hover">
            {activeDocs.map((doc) => (
              <AttachmentRow
                key={doc.id}
                doc={doc}
                canEdit={canEdit}
                onDelete={() => setConfirmDelete(doc)}
              />
            ))}
          </div>
        ) : null}

        {/* Pending files with description inputs */}
        {pendingFiles.length > 0 && (
          <div className="border-t border-border bg-page px-4 py-3 space-y-3">
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">
                {error}
              </div>
            )}
            {pendingFiles.map(({ file, desc }, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <svg
                  className="w-3.5 h-3.5 text-accent shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-xs text-heading font-medium truncate w-32 shrink-0" title={file.name}>
                  {file.name}
                </span>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={desc}
                  onChange={(e) => updateDesc(idx, e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                />
                <button
                  type="button"
                  onClick={() => removePending(idx)}
                  className="p-1 text-muted hover:text-red-500 transition shrink-0"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleUploadAll}
                disabled={uploading}
                className="px-3 py-1 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg font-medium disabled:opacity-50"
              >
                {uploading
                  ? "Uploading…"
                  : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingFiles([]);
                  setError(null);
                }}
                className="px-3 py-1 text-xs border border-border rounded-lg text-secondary hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">
              Delete Attachment?
            </h3>
            <p className="text-sm text-secondary mb-5">
              Delete <strong>&quot;{confirmDelete.file_name}&quot;</strong>?
              This will move it to trash.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Multi-select dropdown ────────────────────────────────────────
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  compact,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useState(() => ({ current: null as HTMLDivElement | null }))[0];

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  return (
    <div
      className="relative"
      ref={(el) => {
        ref.current = el;
      }}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        className={`${compact ? "w-full px-2.5 py-1.5 text-xs border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" : `${inp} min-h-10.5`} flex items-center justify-between gap-2 cursor-pointer flex-wrap`}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-muted text-sm">{placeholder ?? "Select…"}</span>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-sm text-heading truncate" title={selectedLabels.join(", ")}>
              {selectedLabels.slice(0, 2).join(", ")}
            </span>
            {selectedLabels.length > 2 && (
              <span className="shrink-0 inline-flex px-1.5 py-0.5 bg-accent-light text-accent rounded text-xs font-medium">
                +{selectedLabels.length - 2}
              </span>
            )}
          </div>
        )}
        <svg
          className={`w-4 h-4 shrink-0 text-secondary transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">
                No options available
              </div>
            ) : (
              options.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover cursor-pointer"
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.includes(opt.value) ? "bg-primary border-primary" : "border-border-strong"}`}
                  >
                    {selected.includes(opt.value) && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-heading">{opt.label}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Proceeding Form Fields ────────────────────────────────────────
function ProceedingFormFields({
  values,
  onChange,
  onMultiChange,
  mastersByType,
  teamMembers,
  clientUsers,
  guestUsers,
  actRegulationId,
  clientPan,
  clientGstNumbers,
}: {
  values: ProceedingInput;
  onChange: (field: keyof ProceedingInput, value: string) => void;
  onMultiChange: (field: keyof ProceedingInput, value: string[]) => void;
  mastersByType: Record<string, MasterItem[]>;
  teamMembers: { id: string; first_name: string; last_name: string }[];
  clientUsers: { id: string; first_name: string; last_name: string }[];
  guestUsers: { id: string; first_name: string; last_name: string; role: string }[];
  actRegulationId?: string;
  clientPan?: string;
  clientGstNumbers?: string[];
}) {
  const allProcs = mastersByType["proceeding_type"] ?? [];
  const availableProcs = actRegulationId
    ? allProcs.filter((m) => m.parent_id === actRegulationId)
    : allProcs;

  const isFaceless =
    (values.authority_type ?? "").trim().toLowerCase() === "faceless" ||
    values.mode === "faceless";
  const disabledCls =
    "bg-surface-hover text-muted cursor-not-allowed border-border";
  // Compact input style for the 3-column proceeding form
  const pInp =
    "w-full px-2.5 py-1.5 text-xs border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";

  const actRecord = (mastersByType["act_regulation"] ?? []).find(
    (m) => m.id === actRegulationId,
  );
  const isITAct = actRecord?.name.toLowerCase().includes("income") ?? false;
  const isGSTAct = !!(
    actRecord?.name.toLowerCase().includes("central goods") ||
    actRecord?.name.toLowerCase().includes("gst")
  );

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Row 1: Proceeding | Jurisdiction | Authority Name */}
      <Field label="Proceeding">
        <select
          value={values.proceeding_type_id ?? ""}
          onChange={(e) => onChange("proceeding_type_id", e.target.value)}
          className={pInp}
        >
          <option value="">Select…</option>
          {[...availableProcs]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Jurisdiction">
        <input
          value={values.authority_type ?? ""}
          onChange={(e) => onChange("authority_type", e.target.value)}
          placeholder="e.g. ACIT, Circle 1(1)"
          className={pInp}
        />
      </Field>
      <Field label="Authority Name">
        <input
          value={values.authority_name ?? ""}
          onChange={(e) => onChange("authority_name", e.target.value)}
          className={pInp}
        />
      </Field>
      {/* GST Number row — only for GST acts */}
      {isGSTAct && (
        <div className="col-span-3">
          <label className="block text-xs font-medium text-secondary mb-1">
            GST Number
          </label>
          <select
            value={values.gst_number ?? ""}
            onChange={(e) => onChange("gst_number", e.target.value)}
            className={pInp}
          >
            <option value="">
              {(clientGstNumbers ?? []).length
                ? "Select GST number…"
                : "No GST numbers on file"}
            </option>
            {(clientGstNumbers ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* Row 2: Jurisdiction City (1 col) + Jurisdiction / Address (2 cols = fullWidth) */}
      <Field label="Jurisdiction City">
        <input
          value={isFaceless ? "" : (values.jurisdiction_city ?? "")}
          onChange={(e) => onChange("jurisdiction_city", e.target.value)}
          placeholder={isFaceless ? "N/A — Faceless" : "e.g. Chennai"}
          disabled={isFaceless}
          className={`${pInp} ${isFaceless ? disabledCls : ""}`}
        />
      </Field>
      <Field label="Jurisdiction / Address" fullWidth>
        <input
          value={isFaceless ? "" : (values.jurisdiction ?? "")}
          onChange={(e) => onChange("jurisdiction", e.target.value)}
          placeholder={
            isFaceless ? "N/A — Faceless" : "Full jurisdiction or address"
          }
          disabled={isFaceless}
          className={`${pInp} ${isFaceless ? disabledCls : ""}`}
        />
      </Field>
      {/* Row 3: Importance | Mode | Initiated On */}
      <Field label="Importance">
        <select
          value={values.importance ?? ""}
          onChange={(e) => onChange("importance", e.target.value)}
          className={pInp}
        >
          <option value="">Select…</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Field>
      <Field label="Mode">
        <select
          value={values.mode ?? ""}
          onChange={(e) => onChange("mode", e.target.value)}
          className={pInp}
        >
          <option value="">Select…</option>
          <option value="faceless">Faceless</option>
          <option value="jurisdictional">Jurisdictional</option>
          <option value="both">Both</option>
        </select>
      </Field>
      <Field label="Initiated On">
        <input
          type="date"
          value={values.initiated_on ?? ""}
          onChange={(e) => onChange("initiated_on", e.target.value)}
          className={pInp}
        />
      </Field>
      {/* Row 4: Limitation Date | Assigned To | Client Staff */}
      <Field label="Limitation Date">
        <input
          type="date"
          value={values.to_be_completed_by ?? ""}
          onChange={(e) => onChange("to_be_completed_by", e.target.value)}
          className={pInp}
        />
      </Field>
      <Field label="Assigned To">
        <MultiSelect
          compact
          options={[...teamMembers]
            .sort((a, b) =>
              `${a.first_name} ${a.last_name}`.localeCompare(
                `${b.first_name} ${b.last_name}`,
              ),
            )
            .map((m) => ({
              value: m.id,
              label: `${m.first_name} ${m.last_name}`,
            }))}
          selected={values.assigned_to_ids ?? []}
          onChange={(ids) => onMultiChange("assigned_to_ids", ids)}
          placeholder="Unassigned"
        />
      </Field>
      <Field label="Client Staff">
        <MultiSelect
          compact
          options={[...clientUsers]
            .sort((a, b) =>
              `${a.first_name} ${a.last_name}`.localeCompare(
                `${b.first_name} ${b.last_name}`,
              ),
            )
            .map((u) => ({
              value: u.id,
              label: `${u.first_name} ${u.last_name}`,
            }))}
          selected={values.client_staff_ids ?? []}
          onChange={(ids) => onMultiChange("client_staff_ids", ids)}
          placeholder="None"
        />
      </Field>
      <Field label="Guest User" fullWidth>
        <MultiSelect
          compact
          options={[...guestUsers]
            .sort((a, b) =>
              `${a.first_name} ${a.last_name}`.localeCompare(
                `${b.first_name} ${b.last_name}`,
              ),
            )
            .map((u) => ({
              value: u.id,
              label: `${u.first_name} ${u.last_name} (${u.role === "guest_manager" ? "Guest Manager" : "Guest User"})`,
            }))}
          selected={values.guest_ids ?? []}
          onChange={(ids) => onMultiChange("guest_ids", ids)}
          placeholder="No guest access"
        />
      </Field>
      {/* Row 5: Possible Outcome | Status | PAN (IT acts only, read-only) */}
      <Field label="Possible Outcome">
        <select
          value={values.possible_outcome ?? ""}
          onChange={(e) => onChange("possible_outcome", e.target.value)}
          className={pInp}
        >
          <option value="">Select…</option>
          <option value="doubtful">Doubtful</option>
          <option value="favourable">Favourable</option>
          <option value="unfavourable">Unfavourable</option>
        </select>
      </Field>
      <Field label="Status">
        <select
          value={values.status ?? "open"}
          onChange={(e) => onChange("status", e.target.value)}
          className={pInp}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </Field>
      {isITAct && (
        <Field label="PAN (Client Master)">
          <input
            readOnly
            value={clientPan ?? "—"}
            className={`${pInp} bg-surface-hover text-muted cursor-default`}
          />
        </Field>
      )}
    </div>
  );
}

// ─── Demand Issues Editor (Amount tab in modal) ────────────────────
function DemandIssuesEditor({
  issues,
  onChange,
  mainEvents,
}: {
  issues: DraftDemandIssue[];
  onChange: (issues: DraftDemandIssue[]) => void;
  mainEvents?: AppEvent[];
}) {
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const cInp =
    "w-full px-1.5 py-1 text-xs border border-accent rounded focus:outline-none focus:ring-1 focus:ring-primary";
  const cNum = `${cInp} text-right`;
  const cInpTall =
    "w-full px-1.5 py-1.5 text-xs border border-accent rounded focus:outline-none focus:ring-1 focus:ring-primary";

  const isEditMode = mainEvents !== undefined;
  const activeMainEvents = useMemo(
    () =>
      (mainEvents ?? [])
        .filter((e) => !e.deleted_at && e.event_type === "main")
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [mainEvents],
  );
  const meOptions = activeMainEvents.map((ev, idx) => ({
    id: ev.id,
    label: `ME${idx + 1} — ${getEventLabel(ev.category, ev.details ?? {})}`,
  }));

  // The ME link is persisted as linked_event_id (a stable event id), so it survives
  // DB round-trips regardless of whether the linked event's DIN changes later. Whenever
  // the linked event's live data (DIN/date) drifts from what's stored on the draft —
  // because someone edited that Main Event after this issue was linked to it — resync
  // notice_no/notice_date here so both the display and the next save reflect the
  // current event, not a stale snapshot taken at selection time.
  useEffect(() => {
    if (!isEditMode) return;
    let changed = false;
    const next = issues.map((iss) => {
      if (!iss.linked_event_id) return iss;
      const ev = activeMainEvents.find((e) => e.id === iss.linked_event_id);
      if (!ev) return iss;
      const freshNoticeNo = ev.event_notice_number ?? "";
      const freshNoticeDate = ev.event_date ? ev.event_date.slice(0, 10) : "";
      if (iss.notice_no !== freshNoticeNo || iss.notice_date !== freshNoticeDate) {
        changed = true;
        return { ...iss, notice_no: freshNoticeNo, notice_date: freshNoticeDate };
      }
      return iss;
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainEvents, isEditMode]);

  // Fixed width for all three amount columns — box size never changes with content;
  // overflow scrolls inside the input itself instead of resizing the column/table.
  // Cap digits at 15 (within Number.MAX_SAFE_INTEGER) purely to keep sum arithmetic exact.
  const MAX_AMOUNT_DIGITS = 15;
  const amtColPx = 140;
  const summaryAmtColPx = 140;

  const totals = issues.reduce(
    (acc, iss) => {
      acc.demanded +=
        (parseFloat(iss.tax_demanded) || 0) +
        (parseFloat(iss.interest_demanded) || 0) +
        (parseFloat(iss.penalty_demanded) || 0);
      acc.acceptable +=
        (parseFloat(iss.tax_acceptable) || 0) +
        (parseFloat(iss.interest_acceptable) || 0) +
        (parseFloat(iss.penalty_acceptable) || 0);
      acc.dropped +=
        (parseFloat(iss.tax_dropped) || 0) +
        (parseFloat(iss.interest_dropped) || 0) +
        (parseFloat(iss.penalty_dropped) || 0);
      return acc;
    },
    { demanded: 0, acceptable: 0, dropped: 0 },
  );

  const byType = DEMAND_TYPES.reduce(
    (acc, t) => {
      acc[t.key] = issues.reduce(
        (a, iss) => {
          const demanded = parseFloat(getDraftAmount(iss, t.key, "demanded")) || 0;
          const dropped = parseFloat(getDraftAmount(iss, t.key, "dropped")) || 0;
          const acceptable = parseFloat(getDraftAmount(iss, t.key, "acceptable")) || 0;
          a.demanded += demanded;
          a.dropped += dropped;
          a.acceptable += acceptable;
          a.disputed += demanded - dropped - acceptable;
          return a;
        },
        { demanded: 0, dropped: 0, acceptable: 0, disputed: 0 },
      );
      return acc;
    },
    {} as Record<
      DemandTypeKey,
      { demanded: number; dropped: number; acceptable: number; disputed: number }
    >,
  );

  if (isEditMode && activeMainEvents.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center gap-2 text-center">
        <svg
          className="w-8 h-8 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <p className="text-sm font-medium text-heading">No main events found</p>
        <p className="text-xs text-muted">
          Add main events to this proceeding before entering demand amounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-heading mb-1.5">
          Grand Total Breakup
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table
            className="w-full text-xs border-collapse"
            style={{ tableLayout: "fixed" }}
          >
            <thead>
              <tr className="bg-table-header text-left">
                <th className="px-3 py-2 font-semibold text-heading">
                  Particulars
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-info/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Demanded (₹)
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-warning/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Dropped (₹)
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-success/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Acceptable (₹)
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-danger/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Disputed (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMAND_TYPES.map((type) => (
                <tr key={type.key} className="border-t border-border">
                  <td className="px-3 py-1.5 text-secondary">{type.label}</td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-info/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].demanded)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-warning/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].dropped)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-success/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].acceptable)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-danger/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].disputed)}
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-strong bg-accent-tint">
                <td className="px-3 py-1.5 font-bold text-heading">Total</td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.demanded)}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.dropped)}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.acceptable)}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.demanded - totals.acceptable - totals.dropped)}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {issues.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table
            className="w-full text-xs border-collapse"
            style={{ tableLayout: "fixed" }}
          >
            <thead>
              <tr className="bg-table-header text-left">
                <th className="px-2 py-2 font-semibold text-heading w-8">#</th>
                <th className="px-2 py-2 font-semibold text-heading min-w-[260px]">
                  Notice No & Date / Description of the Issue
                </th>
                <th className="px-2 py-2 font-semibold text-heading w-[110px]">
                  Demand Type
                </th>
                <th
                  className="px-2 py-2 font-semibold text-heading text-right"
                  style={{ width: amtColPx }}
                >
                  Demanded (₹)
                </th>
                <th
                  className="px-2 py-2 font-semibold text-heading text-right"
                  style={{ width: amtColPx }}
                >
                  Dropped (₹)
                </th>
                <th
                  className="px-2 py-2 font-semibold text-heading text-right"
                  style={{ width: amtColPx }}
                >
                  Acceptable (₹)
                </th>
                <th
                  className="px-2 py-2 font-semibold text-heading text-right"
                  style={{ width: amtColPx }}
                >
                  Disputed (₹)
                </th>
                <th className="px-2 py-2 font-semibold text-heading min-w-[140px]">
                  Remarks
                </th>
                <th className="px-2 py-2 font-semibold text-heading w-14 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {issues.map((iss, i) => {
                const issueTotals = {
                  demanded:
                    (parseFloat(iss.tax_demanded) || 0) +
                    (parseFloat(iss.interest_demanded) || 0) +
                    (parseFloat(iss.penalty_demanded) || 0),
                  acceptable:
                    (parseFloat(iss.tax_acceptable) || 0) +
                    (parseFloat(iss.interest_acceptable) || 0) +
                    (parseFloat(iss.penalty_acceptable) || 0),
                  dropped:
                    (parseFloat(iss.tax_dropped) || 0) +
                    (parseFloat(iss.interest_dropped) || 0) +
                    (parseFloat(iss.penalty_dropped) || 0),
                };
                const selectedEvent = iss.linked_event_id
                  ? (activeMainEvents.find(
                      (ev) => ev.id === iss.linked_event_id,
                    ) ?? null)
                  : null;
                return (
                  <React.Fragment key={i}>
                    {DEMAND_TYPES.map((type, ti) => {
                      const demanded = getDraftAmount(
                        iss,
                        type.key,
                        "demanded",
                      );
                      const acceptable = getDraftAmount(
                        iss,
                        type.key,
                        "acceptable",
                      );
                      const dropped = getDraftAmount(
                        iss,
                        type.key,
                        "dropped",
                      );
                      const disputed =
                        (parseFloat(demanded) || 0) -
                        (parseFloat(acceptable) || 0) -
                        (parseFloat(dropped) || 0);
                      return (
                        <tr
                          key={`${i}-${type.key}`}
                          className="border-t border-border"
                        >
                          {ti === 0 && (
                            <>
                              <td
                                rowSpan={3}
                                className="px-2 py-1.5 text-center text-muted align-top"
                              >
                                {i + 1}
                              </td>
                              <td rowSpan={3} className="align-top px-2 py-1.5">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex gap-1.5">
                                    {isEditMode ? (
                                      <select
                                        value={selectedEvent?.id ?? ""}
                                        onChange={(e) => {
                                          const evId = e.target.value;
                                          const ev = activeMainEvents.find(
                                            (x) => x.id === evId,
                                          );
                                          onChange(
                                            issues.map((x, idx) =>
                                              idx === i
                                                ? {
                                                    ...x,
                                                    linked_event_id: evId,
                                                    notice_no:
                                                      ev?.event_notice_number ?? "",
                                                    notice_date: ev?.event_date
                                                      ? ev.event_date.slice(0, 10)
                                                      : "",
                                                  }
                                                : x,
                                            ),
                                          );
                                        }}
                                        className={cInpTall}
                                        title={
                                          selectedEvent
                                            ? meOptions.find(
                                                (o) => o.id === selectedEvent.id,
                                              )?.label
                                            : undefined
                                        }
                                      >
                                        <option value="">— Select ME —</option>
                                        {meOptions.map((opt) => (
                                          <option key={opt.id} value={opt.id}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        value={iss.notice_no}
                                        onChange={(e) =>
                                          onChange(
                                            issues.map((x, idx) =>
                                              idx === i
                                                ? {
                                                    ...x,
                                                    notice_no: e.target.value,
                                                  }
                                                : x,
                                            ),
                                          )
                                        }
                                        className={cInpTall}
                                        placeholder="Notice No."
                                        title={iss.notice_no || undefined}
                                      />
                                    )}
                                    <input
                                      type="date"
                                      value={iss.notice_date}
                                      onChange={(e) =>
                                        onChange(
                                          issues.map((x, idx) =>
                                            idx === i
                                              ? {
                                                  ...x,
                                                  notice_date: e.target.value,
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                      className={cInpTall}
                                      required
                                    />
                                  </div>
                                  {isEditMode && selectedEvent && (
                                    <p
                                      className="text-[11px] text-secondary truncate"
                                      title={
                                        selectedEvent.event_notice_number || undefined
                                      }
                                    >
                                      DIN: {selectedEvent.event_notice_number || "—"}
                                    </p>
                                  )}
                                  <textarea
                                    value={iss.description}
                                    onChange={(e) =>
                                      onChange(
                                        issues.map((x, idx) =>
                                          idx === i
                                            ? {
                                                ...x,
                                                description: e.target.value,
                                              }
                                            : x,
                                        ),
                                      )
                                    }
                                    rows={2}
                                    className={`${cInp} py-4 resize-none w-full`}
                                    placeholder="Description…"
                                  />
                                </div>
                              </td>
                            </>
                          )}
                          <td className="px-2 py-1.5 text-secondary whitespace-nowrap">
                            {type.label}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={
                                demanded && demanded !== "0"
                                  ? fmtInr(parseFloat(demanded) || 0)
                                  : ""
                              }
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value
                                  .replace(/[^0-9]/g, "")
                                  .slice(0, MAX_AMOUNT_DIGITS);
                                onChange(
                                  issues.map((x, idx) =>
                                    idx === i
                                      ? setDraftAmount(
                                          x,
                                          type.key,
                                          "demanded",
                                          raw,
                                        )
                                      : x,
                                  ),
                                );
                              }}
                              className={cNum}
                            />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={
                                dropped && dropped !== "0"
                                  ? fmtInr(parseFloat(dropped) || 0)
                                  : ""
                              }
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value
                                  .replace(/[^0-9]/g, "")
                                  .slice(0, MAX_AMOUNT_DIGITS);
                                onChange(
                                  issues.map((x, idx) =>
                                    idx === i
                                      ? setDraftAmount(
                                          x,
                                          type.key,
                                          "dropped",
                                          raw,
                                        )
                                      : x,
                                  ),
                                );
                              }}
                              className={cNum}
                            />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={
                                acceptable && acceptable !== "0"
                                  ? fmtInr(parseFloat(acceptable) || 0)
                                  : ""
                              }
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value
                                  .replace(/[^0-9]/g, "")
                                  .slice(0, MAX_AMOUNT_DIGITS);
                                onChange(
                                  issues.map((x, idx) =>
                                    idx === i
                                      ? setDraftAmount(
                                          x,
                                          type.key,
                                          "acceptable",
                                          raw,
                                        )
                                      : x,
                                  ),
                                );
                              }}
                              className={cNum}
                            />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="w-full px-1.5 py-1 text-xs text-right border border-accent rounded bg-surface-hover text-muted cursor-default select-none">
                              {fmtInr(disputed)}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <input
                              type="text"
                              value={getDraftRemarks(iss, type.key)}
                              onChange={(e) =>
                                onChange(
                                  issues.map((x, idx) =>
                                    idx === i
                                      ? setDraftRemarks(
                                          x,
                                          type.key,
                                          e.target.value,
                                        )
                                      : x,
                                  ),
                                )
                              }
                              className={cInp}
                              placeholder="Remarks…"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center align-middle">
                            {ti === 0 && (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmIdx(i)}
                                title="Remove issue"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            )}
                            {ti === 1 && (
                              <span className="text-muted">–</span>
                            )}
                            {ti === 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onChange([...issues, blankDraftIssue()])
                                }
                                title="Add issue"
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-success text-success hover:bg-success/10 transition-colors"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-surface-hover">
                      <td
                        colSpan={3}
                        className="px-2 py-1 text-right font-semibold text-heading"
                      >
                        Total
                      </td>
                      <td className="px-3 py-1 text-right font-semibold text-heading">
                        {fmtInr(issueTotals.demanded)}
                      </td>
                      <td className="px-3 py-1 text-right font-semibold text-heading">
                        {fmtInr(issueTotals.dropped)}
                      </td>
                      <td className="px-3 py-1 text-right font-semibold text-heading">
                        {fmtInr(issueTotals.acceptable)}
                      </td>
                      <td className="px-3 py-1 text-right font-semibold text-heading">
                        {fmtInr(
                          issueTotals.demanded -
                            issueTotals.acceptable -
                            issueTotals.dropped,
                        )}
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            {issues.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-border-strong bg-accent-tint">
                  <td
                    colSpan={3}
                    className="px-2 py-1.5 text-right font-bold text-heading"
                  >
                    Grand Total
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-heading">
                    {fmtInr(totals.demanded)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-heading">
                    {fmtInr(totals.dropped)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-heading">
                    {fmtInr(totals.acceptable)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-heading">
                    {fmtInr(totals.demanded - totals.acceptable - totals.dropped)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {issues.length === 0 && (
        <div className="text-center py-6">
          <p className="text-xs text-muted mb-2">No demand issues yet.</p>
          <button
            type="button"
            onClick={() => onChange([...issues, blankDraftIssue()])}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Issue
          </button>
        </div>
      )}

      {deleteConfirmIdx !== null && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10 rounded-xl">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">
              Remove Demand Issue?
            </h3>
            <p className="text-sm text-secondary mb-5">
              Issue #{deleteConfirmIdx + 1} will be removed. This cannot be
              undone after saving.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmIdx(null)}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(issues.filter((_, idx) => idx !== deleteConfirmIdx));
                  setDeleteConfirmIdx(null);
                }}
                className="flex-1 px-4 py-2 text-sm bg-danger hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Demand Issues Read-Only (inline accordion Amount section) ──────
function DemandIssuesReadOnly({ issues }: { issues: DemandIssue[] }) {
  // Fixed width so the summary table's columns never reflow when totals grow.
  const summaryAmtColPx = 140;
  const totals = issues.reduce(
    (acc, iss) => {
      acc.demanded +=
        iss.tax_demanded + iss.interest_demanded + iss.penalty_demanded;
      acc.acceptable +=
        iss.tax_acceptable + iss.interest_acceptable + iss.penalty_acceptable;
      acc.dropped +=
        (iss.tax_dropped ?? 0) +
        (iss.interest_dropped ?? 0) +
        (iss.penalty_dropped ?? 0);
      return acc;
    },
    { demanded: 0, acceptable: 0, dropped: 0 },
  );

  const byType: Record<
    DemandTypeKey,
    { demanded: number; dropped: number; acceptable: number; disputed: number }
  > = {
    tax: { demanded: 0, dropped: 0, acceptable: 0, disputed: 0 },
    interest: { demanded: 0, dropped: 0, acceptable: 0, disputed: 0 },
    penalty: { demanded: 0, dropped: 0, acceptable: 0, disputed: 0 },
  };
  const addToByType = (
    key: DemandTypeKey,
    demanded: number,
    dropped: number,
    acceptable: number,
  ) => {
    byType[key].demanded += demanded;
    byType[key].dropped += dropped;
    byType[key].acceptable += acceptable;
    byType[key].disputed += demanded - dropped - acceptable;
  };
  for (const iss of issues) {
    addToByType("tax", iss.tax_demanded, iss.tax_dropped ?? 0, iss.tax_acceptable);
    addToByType(
      "interest",
      iss.interest_demanded,
      iss.interest_dropped ?? 0,
      iss.interest_acceptable,
    );
    addToByType(
      "penalty",
      iss.penalty_demanded,
      iss.penalty_dropped ?? 0,
      iss.penalty_acceptable,
    );
  }

  if (issues.length === 0)
    return (
      <p className="text-xs text-muted py-2">No demand amounts recorded.</p>
    );
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-heading mb-1.5">
          Grand Total Breakup
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table
            className="w-full text-xs border-collapse"
            style={{ tableLayout: "fixed" }}
          >
            <thead>
              <tr className="bg-table-header text-left">
                <th className="px-3 py-2 font-semibold text-heading">
                  Particulars
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-info/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Demanded (₹)
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-warning/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Dropped (₹)
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-success/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Acceptable (₹)
                </th>
                <th
                  className="px-3 py-2 font-semibold text-heading text-right bg-danger/10"
                  style={{ width: summaryAmtColPx }}
                >
                  Disputed (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMAND_TYPES.map((type) => (
                <tr key={type.key} className="border-t border-border">
                  <td className="px-3 py-1.5 text-secondary">{type.label}</td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-info/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].demanded)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-warning/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].dropped)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-success/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].acceptable)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-secondary bg-danger/10">
                    <div className="overflow-x-auto whitespace-nowrap">
                      {fmtInr(byType[type.key].disputed)}
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-strong bg-accent-tint">
                <td className="px-3 py-1.5 font-bold text-heading">Total</td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.demanded)}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.dropped)}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.acceptable)}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-heading">
                  <div className="overflow-x-auto whitespace-nowrap">
                    {fmtInr(totals.demanded - totals.acceptable - totals.dropped)}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-table-header text-left">
              <th className="px-2 py-2 font-semibold text-heading w-8">#</th>
              <th className="px-2 py-2 font-semibold text-heading min-w-[260px]">
                Notice No & Date / Description of the Issue
              </th>
              <th className="px-2 py-2 font-semibold text-heading">Demand Type</th>
              <th className="px-2 py-2 font-semibold text-heading text-right">
                Demanded (₹)
              </th>
              <th className="px-2 py-2 font-semibold text-heading text-right">
                Dropped (₹)
              </th>
              <th className="px-2 py-2 font-semibold text-heading text-right">
                Acceptable (₹)
              </th>
              <th className="px-2 py-2 font-semibold text-heading text-right">
                Disputed (₹)
              </th>
              <th className="px-2 py-2 font-semibold text-heading min-w-[140px]">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody>
            {issues.map((iss, i) => {
              const rows = [
                {
                  label: "Tax",
                  demanded: iss.tax_demanded,
                  acceptable: iss.tax_acceptable,
                  dropped: iss.tax_dropped ?? 0,
                  remarks: iss.tax_remarks ?? "",
                },
                {
                  label: "Interest",
                  demanded: iss.interest_demanded,
                  acceptable: iss.interest_acceptable,
                  dropped: iss.interest_dropped ?? 0,
                  remarks: iss.interest_remarks ?? "",
                },
                {
                  label: "Penalty",
                  demanded: iss.penalty_demanded,
                  acceptable: iss.penalty_acceptable,
                  dropped: iss.penalty_dropped ?? 0,
                  remarks: iss.penalty_remarks ?? "",
                },
              ];
              const issueTotals = rows.reduce(
                (a, r) => ({
                  demanded: a.demanded + r.demanded,
                  acceptable: a.acceptable + r.acceptable,
                  dropped: a.dropped + r.dropped,
                }),
                { demanded: 0, acceptable: 0, dropped: 0 },
              );
              return (
                <React.Fragment key={iss.id}>
                  {rows.map((row, ri) => (
                    <tr key={`${i}-${ri}`} className="border-t border-border">
                      {ri === 0 && (
                        <>
                          <td
                            rowSpan={3}
                            className="px-2 py-1.5 text-center text-muted align-top"
                          >
                            {i + 1}
                          </td>
                          <td
                            rowSpan={3}
                            className="px-2 py-1.5 align-top text-secondary"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-col gap-0.5">
                                <span title={iss.notice_no || undefined}>
                                  {iss.notice_no || "—"}
                                </span>
                                <span className="text-muted text-xs">
                                  {iss.notice_date
                                    ? new Date(
                                        iss.notice_date,
                                      ).toLocaleDateString("en-IN")
                                    : "—"}
                                </span>
                              </div>
                              <span>{iss.description || "—"}</span>
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1.5 text-secondary whitespace-nowrap">
                        {row.label}
                      </td>
                      <td className="px-2 py-1.5 text-right text-secondary">
                        {fmtInr(row.demanded)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-secondary">
                        {fmtInr(row.dropped)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-secondary">
                        {fmtInr(row.acceptable)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-secondary">
                        {fmtInr(row.demanded - row.acceptable - row.dropped)}
                      </td>
                      <td className="px-2 py-1.5 text-secondary">
                        {row.remarks || "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-surface-hover">
                    <td
                      colSpan={3}
                      className="px-2 py-1 text-right font-semibold text-heading"
                    >
                      Total
                    </td>
                    <td className="px-2 py-1 text-right font-semibold text-heading">
                      {fmtInr(issueTotals.demanded)}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold text-heading">
                      {fmtInr(issueTotals.dropped)}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold text-heading">
                      {fmtInr(issueTotals.acceptable)}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold text-heading">
                      {fmtInr(
                        issueTotals.demanded -
                          issueTotals.acceptable -
                          issueTotals.dropped,
                      )}
                    </td>
                    <td></td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          {issues.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-border-strong bg-accent-tint">
                <td
                  colSpan={3}
                  className="px-2 py-1.5 text-right font-bold text-heading"
                >
                  Grand Total
                </td>
                <td className="px-2 py-1.5 text-right font-bold text-heading">
                  {fmtInr(totals.demanded)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold text-heading">
                  {fmtInr(totals.dropped)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold text-heading">
                  {fmtInr(totals.acceptable)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold text-heading">
                  {fmtInr(totals.demanded - totals.acceptable - totals.dropped)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  isDirty,
  size = "md",
  children,
}: {
  title: string;
  onClose: () => void;
  isDirty?: boolean;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  const [showDiscard, setShowDiscard] = useState(false);

  function handleClose() {
    if (isDirty) setShowDiscard(true);
    else onClose();
  }

  // ESC: if discard confirm is visible, dismiss it; else respect dirty state
  useEscHandler(() => {
    if (showDiscard) setShowDiscard(false);
    else if (isDirty) setShowDiscard(true);
    else onClose();
  }, true);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-xl shadow-xl border border-border w-full ${size === "xl" ? "max-w-[84.48rem] h-[88vh]" : size === "lg" ? "max-w-5xl h-[88vh]" : "max-w-2xl max-h-[90vh]"} flex flex-col`}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold text-heading">{title}</h3>
          <button
            onClick={handleClose}
            className="text-muted hover:text-secondary"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div
          className={
            size === "lg" || size === "xl"
              ? "flex-1 overflow-hidden flex flex-col"
              : "p-6 overflow-y-auto flex-1"
          }
        >
          {children}
        </div>
      </div>
      {showDiscard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">
              Discard Changes?
            </h3>
            <p className="text-sm text-secondary mb-5">
              You have unsaved changes. Discard them and close?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiscard(false)}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Keep Editing
              </button>
              <button
                onClick={() => {
                  setShowDiscard(false);
                  onClose();
                }}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Proceeding Contacts Tab ──────────────────────────────────────
function ProceedingContactsTab({
  contacts,
  onChange,
  canEdit,
}: {
  contacts: ProceedingContact[];
  onChange: (contacts: ProceedingContact[]) => void;
  canEdit: boolean;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProceedingContact>({
    id: "",
    designation: "",
    name: "",
    mobile: "",
    email: "",
  });
  const [addMode, setAddMode] = useState(false);
  const [newDraft, setNewDraft] = useState<ProceedingContact>({
    id: "",
    designation: "",
    name: "",
    mobile: "",
    email: "",
  });

  const colGrid = canEdit
    ? "1fr 1.2fr 130px 1.5fr 68px"
    : "1fr 1.2fr 130px 1.5fr";

  function startEdit(idx: number) {
    setAddMode(false);
    setEditIdx(idx);
    setDraft({ ...contacts[idx] });
  }
  function cancelEdit() {
    setEditIdx(null);
  }
  function saveEdit() {
    if (editIdx === null) return;
    onChange(contacts.map((c, i) => (i === editIdx ? draft : c)));
    setEditIdx(null);
  }
  function deleteContact(idx: number) {
    onChange(contacts.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  }
  function startAdd() {
    setEditIdx(null);
    setNewDraft({
      id: crypto.randomUUID(),
      designation: "",
      name: "",
      mobile: "",
      email: "",
    });
    setAddMode(true);
  }
  function saveNew() {
    if (!newDraft.name && !newDraft.designation) return;
    onChange([...contacts, newDraft]);
    setAddMode(false);
  }
  function cancelAdd() {
    setAddMode(false);
  }

  const inp =
    "w-full px-2 py-1.5 text-xs border border-accent rounded focus:outline-none focus:ring-1 focus:ring-primary";
  const checkBtn =
    "p-1.5 rounded hover:bg-surface-hover text-success transition-colors inline-flex";
  const xBtn =
    "p-1.5 rounded hover:bg-surface-hover text-muted hover:text-heading transition-colors inline-flex";

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div
          className="grid bg-table-header border-b border-table-header-border"
          style={{ gridTemplateColumns: colGrid }}
        >
          <div className="px-3 py-2 text-xs font-semibold text-heading">
            Designation
          </div>
          <div className="px-3 py-2 text-xs font-semibold text-heading">
            Name
          </div>
          <div className="px-3 py-2 text-xs font-semibold text-heading">
            Mobile #
          </div>
          <div className="px-3 py-2 text-xs font-semibold text-heading">
            Email ID
          </div>
          {canEdit && <div className="px-3 py-2" />}
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {contacts.length === 0 && !addMode && (
            <div className="px-3 py-5 text-xs text-muted text-center">
              No contacts added yet.
            </div>
          )}

          {contacts.map((contact, idx) => (
            <div
              key={contact.id}
              className="grid items-center"
              style={{ gridTemplateColumns: colGrid }}
            >
              {editIdx === idx ? (
                <>
                  <div className="px-2 py-1.5">
                    <input
                      className={inp}
                      value={draft.designation}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, designation: e.target.value }))
                      }
                      placeholder="Designation"
                      autoFocus
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <input
                      className={inp}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                      placeholder="Name"
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <input
                      className={inp}
                      value={draft.mobile}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, mobile: e.target.value }))
                      }
                      placeholder="Mobile #"
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <input
                      className={inp}
                      value={draft.email}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, email: e.target.value }))
                      }
                      placeholder="Email"
                      type="email"
                    />
                  </div>
                  <div className="px-2 py-1.5 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className={checkBtn}
                      title="Save"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className={xBtn}
                      title="Cancel"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-3 py-2.5 text-xs text-heading truncate" title={contact.designation || undefined}>
                    {contact.designation || "—"}
                  </div>
                  <div className="px-3 py-2.5 text-xs text-secondary truncate" title={contact.name || undefined}>
                    {contact.name || "—"}
                  </div>
                  <div className="px-3 py-2.5 text-xs text-secondary">
                    {contact.mobile || "—"}
                  </div>
                  <div className="px-3 py-2.5 text-xs text-secondary truncate" title={contact.email || undefined}>
                    {contact.email || "—"}
                  </div>
                  {canEdit && (
                    <div className="px-2 py-1.5 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startEdit(idx)}
                        className="p-1.5 rounded hover:bg-surface-hover text-secondary hover:text-heading transition-colors inline-flex"
                        title="Edit"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteContact(idx)}
                        className="p-1.5 rounded hover:bg-surface-hover text-red-400 hover:text-red-600 transition-colors inline-flex"
                        title="Delete"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Add new row inline */}
          {addMode && (
            <div
              className="grid items-center bg-accent-faint"
              style={{ gridTemplateColumns: colGrid }}
            >
              <div className="px-2 py-1.5">
                <input
                  className={inp}
                  value={newDraft.designation}
                  onChange={(e) =>
                    setNewDraft((d) => ({ ...d, designation: e.target.value }))
                  }
                  placeholder="Designation"
                  autoFocus
                />
              </div>
              <div className="px-2 py-1.5">
                <input
                  className={inp}
                  value={newDraft.name}
                  onChange={(e) =>
                    setNewDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Name"
                />
              </div>
              <div className="px-2 py-1.5">
                <input
                  className={inp}
                  value={newDraft.mobile}
                  onChange={(e) =>
                    setNewDraft((d) => ({ ...d, mobile: e.target.value }))
                  }
                  placeholder="Mobile #"
                />
              </div>
              <div className="px-2 py-1.5">
                <input
                  className={inp}
                  value={newDraft.email}
                  onChange={(e) =>
                    setNewDraft((d) => ({ ...d, email: e.target.value }))
                  }
                  placeholder="Email"
                  type="email"
                />
              </div>
              <div className="px-2 py-1.5 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={saveNew}
                  className={checkBtn}
                  title="Add"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={cancelAdd}
                  className={xBtn}
                  title="Cancel"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {canEdit && !addMode && (
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-secondary hover:text-heading hover:bg-surface-hover transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Contact
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function AppealDetailClient({
  appeal,
  clients,
  teamMembers,
  clientUsers,
  guestUsers,
  mastersByType,
  canEdit,
  clientPan,
  clientGstNumbers,
}: Props) {
  const router = useRouter();
  const clientOrg = appeal.client_org ?? null;

  // Refs that capture initial form values for dirty-checking edit modals
  const editProcInitRef = useRef<ProceedingInput>({});
  const editEventInitRef = useRef<{
    category: string;
    details: Record<string, string>;
    description: string;
    status: string;
    noticeNumber: string;
    parentId: string | null;
  }>({
    category: "",
    details: {},
    description: "",
    status: "open",
    noticeNumber: "",
    parentId: null,
  });

  // ── Edit Appeal ──
  const [showEditAppeal, setShowEditAppeal] = useState(false);
  const [editClientId, setEditClientId] = useState(clientOrg?.id ?? "");
  const [editFY, setEditFY] = useState(appeal.financial_year?.id ?? "");
  const [editAY, setEditAY] = useState(appeal.assessment_year?.id ?? "");
  const [editAct, setEditAct] = useState(appeal.act_regulation?.id ?? "");
  const [editAppealStatus, setEditAppealStatus] = useState(
    appeal.status ?? "open",
  );
  const [editLitigationTypeId, setEditLitigationTypeId] = useState(
    appeal.litigation_type?.id ?? "",
  );
  const [appealSaving, setAppealSaving] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  // Derive AY state for edit modal
  const editActObj = (mastersByType["act_regulation"] ?? []).find(
    (m) => m.id === editAct,
  );
  const editActName = editActObj?.name;
  const editIsITAct1961 = editActName === "The Income-tax Act, 1961";
  const editIsITAct2025 = editActName === "The Income-tax Act, 2025";
  const editHideAY = !!(
    editActName?.includes("Income-tax Act, 2025") ||
    editActName?.toLowerCase().includes("central goods")
  );
  const detailHideAY = !!(
    appeal.act_regulation?.name?.includes("Income-tax Act, 2025") ||
    appeal.act_regulation?.name?.toLowerCase().includes("central goods")
  );
  const editFYObj = (mastersByType["financial_year"] ?? []).find(
    (m) => m.id === editFY,
  );
  const editFYName = editFYObj?.name ?? "";
  const editAYDisabled =
    !editIsITAct1961 || (editFYName ? isAYDisabled(editFYName) : false);
  const editAYName = editAYDisabled
    ? "Not applicable"
    : ((mastersByType["assessment_year"] ?? []).find((m) => m.id === editAY)
        ?.name ?? "—");
  const editAvailableFY = filterFYForAct(
    mastersByType["financial_year"] ?? [],
    editActName,
  );
  const editAvailableLitigationTypes = editAct
    ? (mastersByType["litigation_type"] ?? []).filter((m) => m.parent_id === editAct)
    : [];

  function handleEditActChange(actId: string) {
    setEditAct(actId);
    setEditFY("");
    setEditAY("");
    setEditLitigationTypeId("");
  }

  function handleEditFYChange(fyId: string) {
    setEditFY(fyId);
    if (!fyId || !editIsITAct1961) {
      setEditAY("");
      return;
    }
    const fy = (mastersByType["financial_year"] ?? []).find(
      (m) => m.id === fyId,
    );
    if (!fy || isAYDisabled(fy.name)) {
      setEditAY("");
      return;
    }
    const derivedName = deriveAYName(fy.name);
    const ayItem = (mastersByType["assessment_year"] ?? []).find(
      (m) => m.name === derivedName,
    );
    setEditAY(ayItem?.id ?? "");
  }

  async function handleSaveAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!editClientId) {
      setAppealError("Client is required.");
      return;
    }
    setAppealSaving(true);
    setAppealError(null);
    try {
      await updateAppeal(appeal.id, {
        client_org_id: editClientId,
        financial_year_id: editFY,
        assessment_year_id: editAY,
        act_regulation_id: editAct,
        status: editAppealStatus,
        litigation_type_id: editLitigationTypeId || undefined,
      });
      setShowEditAppeal(false);
      router.refresh();
    } catch (err) {
      setAppealError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setAppealSaving(false);
    }
  }

  // ── Inline quick-edit (status / outcome / importance dropdowns) ──
  const [inlineSaving, setInlineSaving] = useState<Record<string, boolean>>({});

  async function handleAppealStatusInline(newStatus: string) {
    setInlineSaving((s) => ({ ...s, appeal_status: true }));
    try {
      await updateAppeal(appeal.id, {
        client_org_id: appeal.client_org?.id ?? "",
        financial_year_id: appeal.financial_year?.id,
        assessment_year_id: appeal.assessment_year?.id,
        act_regulation_id: appeal.act_regulation?.id,
        status: newStatus,
        litigation_type_id: appeal.litigation_type?.id ?? undefined,
      });
      router.refresh();
    } finally {
      setInlineSaving((s) => ({ ...s, appeal_status: false }));
    }
  }

  async function handleAppealLitigationTypeInline(newTypeId: string) {
    setInlineSaving((s) => ({ ...s, appeal_litigation_type: true }));
    try {
      await updateAppeal(appeal.id, {
        client_org_id: appeal.client_org?.id ?? "",
        financial_year_id: appeal.financial_year?.id,
        assessment_year_id: appeal.assessment_year?.id,
        act_regulation_id: appeal.act_regulation?.id,
        status: appeal.status ?? "open",
        litigation_type_id: newTypeId || undefined,
      });
      router.refresh();
    } finally {
      setInlineSaving((s) => ({ ...s, appeal_litigation_type: false }));
    }
  }

  async function handleProcInline(
    proc: Proceeding,
    field: "possible_outcome" | "importance" | "status",
    value: string,
  ) {
    const key = `proc_${proc.id}_${field}`;
    setInlineSaving((s) => ({ ...s, [key]: true }));
    try {
      await updateProceeding(proc.id, {
        proceeding_type_id: proc.proceeding_type?.id,
        authority_type: proc.authority_type ?? "",
        authority_name: proc.authority_name ?? "",
        jurisdiction: proc.jurisdiction ?? "",
        jurisdiction_city: proc.jurisdiction_city ?? "",
        importance: field === "importance" ? value : (proc.importance ?? ""),
        mode: proc.mode ?? "",
        initiated_on: proc.initiated_on ?? "",
        to_be_completed_by: proc.to_be_completed_by ?? "",
        assigned_to_ids: proc.assigned_to_ids ?? [],
        client_staff_ids: proc.client_staff_ids ?? [],
        guest_ids: proc.guest_ids ?? [],
        possible_outcome:
          field === "possible_outcome" ? value : (proc.possible_outcome ?? ""),
        status: field === "status" ? value : (proc.status ?? "open"),
        gst_number: proc.gst_number ?? "",
      });
      router.refresh();
    } finally {
      setInlineSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleEventStatusInline(
    ev: AppEvent,
    procId: string,
    newStatus: string,
  ) {
    const key = `event_${ev.id}_status`;
    setInlineSaving((s) => ({ ...s, [key]: true }));
    try {
      await updateEvent(ev.id, {
        proceeding_id: procId,
        event_type: ev.event_type,
        category: ev.category,
        parent_event_id: ev.parent_event_id ?? undefined,
        event_date: ev.event_date ?? undefined,
        status: newStatus,
        event_notice_number: ev.event_notice_number ?? undefined,
        description: ev.description ?? undefined,
        details: (ev.details ?? {}) as Record<string, string>,
      });
      router.refresh();
    } finally {
      setInlineSaving((s) => ({ ...s, [key]: false }));
    }
  }

  // ── Edit Proceeding ──
  const [editProc, setEditProc] = useState<Proceeding | null>(null);
  const [editProcValues, setEditProcValues] = useState<ProceedingInput>({});
  const [editProcSaving, setEditProcSaving] = useState(false);
  const [editProcError, setEditProcError] = useState<string | null>(null);
  const [editProcTab, setEditProcTab] = useState<
    "details" | "contacts" | "amount"
  >("details");
  const [editProcContacts, setEditProcContacts] = useState<ProceedingContact[]>(
    [],
  );
  const [editProcDemandIssues, setEditProcDemandIssues] = useState<
    DraftDemandIssue[]
  >([]);
  const editProcContactsInitRef = useRef<ProceedingContact[]>([]);
  const editProcDemandInitRef = useRef<DraftDemandIssue[]>([]);

  async function openEditProc(proc: Proceeding) {
    const initValues: ProceedingInput = {
      proceeding_type_id: proc.proceeding_type?.id ?? "",
      authority_type: proc.authority_type ?? "",
      authority_name: proc.authority_name ?? "",
      jurisdiction: proc.jurisdiction ?? "",
      jurisdiction_city: proc.jurisdiction_city ?? "",
      importance: proc.importance ?? "",
      mode: proc.mode ?? "",
      initiated_on: proc.initiated_on ?? "",
      to_be_completed_by: proc.to_be_completed_by ?? "",
      assigned_to_ids: proc.assigned_to_ids ?? [],
      client_staff_ids: proc.client_staff_ids ?? [],
      guest_ids: proc.guest_ids ?? [],
      possible_outcome: proc.possible_outcome ?? "",
      status: proc.status ?? "open",
      gst_number: proc.gst_number ?? "",
    };
    editProcInitRef.current = initValues;
    const initContacts = proc.contacts ?? [];
    editProcContactsInitRef.current = initContacts;
    editProcDemandInitRef.current = [];
    setEditProcDemandIssues([]);
    setEditProc(proc);
    setEditProcValues(initValues);
    setEditProcContacts(initContacts);
    setEditProcTab("details");
    setEditProcError(null);
    try {
      const existing = await getDemandIssues(proc.id);
      const drafts = existing.map(toDraftIssue);
      editProcDemandInitRef.current = drafts;
      setEditProcDemandIssues(drafts);
    } catch {
      editProcDemandInitRef.current = [];
      setEditProcDemandIssues([]);
    }
  }

  async function handleSaveProc(e: React.FormEvent) {
    e.preventDefault();
    if (!editProc) return;
    setEditProcSaving(true);
    setEditProcError(null);
    try {
      await updateProceeding(editProc.id, {
        ...editProcValues,
        contacts: editProcContacts,
      });
      await saveDemandIssues(
        editProc.id,
        editProcDemandIssues.map((d, i) => fromDraftIssue(d, i)),
      );
      const saved = editProcDemandIssues.map(
        (d, i) =>
          ({
            ...fromDraftIssue(d, i),
            id: "",
            proceeding_id: editProc.id,
            created_at: "",
          }) as DemandIssue,
      );
      setDemandIssuesByProc((prev) => ({ ...prev, [editProc.id]: saved }));
      setDemandLoadedProcs((prev) => new Set(prev).add(editProc.id));
      setEditProc(null);
      router.refresh();
    } catch (err) {
      setEditProcError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setEditProcSaving(false);
    }
  }

  // ── Add Proceeding ──
  const [showAddProc, setShowAddProc] = useState(false);
  const [addProcValues, setAddProcValues] = useState<ProceedingInput>({});
  const [addProcSaving, setAddProcSaving] = useState(false);
  const [addProcError, setAddProcError] = useState<string | null>(null);
  const [addProcTab, setAddProcTab] = useState<
    "details" | "contacts" | "amount"
  >("details");
  const [addProcContacts, setAddProcContacts] = useState<ProceedingContact[]>(
    [],
  );
  const [addProcDemandIssues, setAddProcDemandIssues] = useState<
    DraftDemandIssue[]
  >([]);

  const [addProcPendingFiles, setAddProcPendingFiles] = useState<
    { file: File; desc: string }[]
  >([]);

  async function handleAddProc(e: React.FormEvent) {
    e.preventDefault();
    setAddProcSaving(true);
    setAddProcError(null);
    try {
      const procId = await addProceeding(appeal.id, {
        ...addProcValues,
        contacts: addProcContacts,
      });
      if (addProcPendingFiles.length > 0) {
        const supabase = createClient();
        for (const { file, desc } of addProcPendingFiles) {
          const path = `proceeding-docs/${procId}/${Date.now()}-${sanitizeFileName(file.name)}`;
          const { data, error: upErr } = await supabase.storage
            .from("org-files")
            .upload(path, file, { upsert: true });
          if (upErr || !data)
            throw new Error(
              `"${file.name}": ${upErr?.message ?? "Upload failed"}`,
            );
          const { data: urlData } = supabase.storage
            .from("org-files")
            .getPublicUrl(data.path);
          await uploadProceedingDocument(
            procId,
            file.name,
            urlData.publicUrl,
            file.size,
            desc.trim() || undefined,
          );
        }
      }
      if (addProcDemandIssues.length > 0) {
        await saveDemandIssues(
          procId,
          addProcDemandIssues.map((d, i) => fromDraftIssue(d, i)),
        );
      }
      setShowAddProc(false);
      setAddProcValues({});
      setAddProcPendingFiles([]);
      setAddProcContacts([]);
      setAddProcDemandIssues([]);
      setAddProcTab("details");
      router.refresh();
    } catch (err) {
      setAddProcError(
        err instanceof Error ? err.message : "Failed to add proceeding.",
      );
    } finally {
      setAddProcSaving(false);
    }
  }

  // ── Add Event ──
  const [addEventProcId, setAddEventProcId] = useState<string | null>(null);
  const [addEventParentId, setAddEventParentId] = useState<string | null>(null); // null = main, string = parent main event ID for sub
  const [eventCategory, setEventCategory] = useState("");
  const [eventDetails, setEventDetails] = useState<Record<string, string>>({});
  const [eventDescription, setEventDescription] = useState("");
  const [eventStatus, setEventStatus] = useState("open");
  const [eventNoticeNumber, setEventNoticeNumber] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [addEventFieldErrors, setAddEventFieldErrors] = useState<
    Record<string, string>
  >({});
  const [addEventPendingFiles, setAddEventPendingFiles] = useState<
    { file: File; desc: string }[]
  >([]);

  // ── View Event ──
  const [viewEvent, setViewEvent] = useState<AppEvent | null>(null);

  // ── Edit Event ──
  const [editEvent, setEditEvent] = useState<AppEvent | null>(null);
  const [editEventType, setEditEventType] = useState<"main" | "sub">("main");
  const [editEventCategory, setEditEventCategory] = useState("");
  const [editEventDetails, setEditEventDetails] = useState<
    Record<string, string>
  >({});
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventStatus, setEditEventStatus] = useState("open");
  const [editEventNoticeNumber, setEditEventNoticeNumber] = useState("");
  const [editEventParentId, setEditEventParentId] = useState<string | null>(
    null,
  );
  const [editEventProceedingId, setEditEventProceedingId] =
    useState<string>("");
  const [editEventSaving, setEditEventSaving] = useState(false);
  const [editEventError, setEditEventError] = useState<string | null>(null);
  const [editEventFieldErrors, setEditEventFieldErrors] = useState<
    Record<string, string>
  >({});

  function openEditEvent(ev: AppEvent) {
    const initDetails = ev.details ? { ...ev.details } : {};
    const procId =
      (appeal.proceedings ?? []).find((p) =>
        (p.events ?? []).some((e) => e.id === ev.id),
      )?.id ?? "";
    editEventInitRef.current = {
      category: ev.category,
      details: initDetails,
      description: ev.description ?? "",
      status: ev.status ?? "open",
      noticeNumber: ev.event_notice_number ?? "",
      parentId: ev.parent_event_id ?? null,
    };
    setEditEvent(ev);
    setEditEventType((ev.event_type as "main" | "sub") ?? "main");
    setEditEventCategory(ev.category);
    setEditEventDetails(initDetails);
    setEditEventDescription(ev.description ?? "");
    setEditEventStatus(ev.status ?? "open");
    setEditEventNoticeNumber(ev.event_notice_number ?? "");
    setEditEventParentId(ev.parent_event_id ?? null);
    setEditEventProceedingId(procId);
    setEditEventError(null);
    setEditEventFieldErrors({});
  }

  function setEditDetail(key: string, value: string) {
    setEditEventDetails((prev) => ({ ...prev, [key]: value }));
    setEditEventFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editEvent || !editEventCategory) {
      setEditEventError("Category is required.");
      return;
    }
    const effectiveCategory =
      editEventType === "sub" && editEventCategory === "others"
        ? "others_sub"
        : editEventCategory;
    const primaryKey = PRIMARY_DATE[effectiveCategory];
    if (primaryKey && !editEventDetails[primaryKey]) {
      const fieldLabel =
        CATEGORY_FIELDS[effectiveCategory]?.find((f) => f.key === primaryKey)
          ?.label ?? primaryKey;
      setEditEventFieldErrors({
        [primaryKey]: `${fieldLabel} cannot be empty`,
      });
      return;
    }
    setEditEventSaving(true);
    setEditEventError(null);
    try {
      const primaryDate =
        primaryKey && editEventDetails[primaryKey]
          ? new Date(editEventDetails[primaryKey]).toISOString()
          : undefined;
      await updateEvent(editEvent.id, {
        proceeding_id: "", // not used in update
        event_type: editEventType,
        category: editEventCategory,
        parent_event_id: editEventParentId ?? undefined,
        event_date: primaryDate,
        status: editEventStatus,
        event_notice_number: editEventNoticeNumber || undefined,
        description: editEventDescription || undefined,
        details: editEventDetails,
      });
      setEditEvent(null);
      router.refresh();
    } catch (err) {
      setEditEventError(
        err instanceof Error ? err.message : "Failed to save event.",
      );
    } finally {
      setEditEventSaving(false);
    }
  }

  // ── Delete Event ──
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<AppEvent | null>(
    null,
  );
  const [deletingEvent, setDeletingEvent] = useState(false);

  async function handleDeleteEvent() {
    if (!confirmDeleteEvent) return;
    setDeletingEvent(true);
    try {
      await deleteEvent(confirmDeleteEvent.id);
      setConfirmDeleteEvent(null);
      router.refresh();
    } catch {
      // swallow — rare; could add error state if needed
    } finally {
      setDeletingEvent(false);
    }
  }

  // ── Delete Proceeding ──
  const [confirmDeleteProc, setConfirmDeleteProc] = useState<Proceeding | null>(
    null,
  );
  const [deletingProc, setDeletingProc] = useState(false);

  async function handleDeleteProceeding() {
    if (!confirmDeleteProc) return;
    setDeletingProc(true);
    try {
      await deleteProceeding(confirmDeleteProc.id);
      setConfirmDeleteProc(null);
      router.refresh();
    } catch {
      // swallow
    } finally {
      setDeletingProc(false);
    }
  }

  // ── Delete Appeal ──
  const [confirmDeleteAppeal, setConfirmDeleteAppeal] = useState(false);
  const [deletingAppeal, setDeletingAppeal] = useState(false);
  const [deleteAppealError, setDeleteAppealError] = useState<string | null>(
    null,
  );

  async function handleDeleteAppeal() {
    setDeletingAppeal(true);
    setDeleteAppealError(null);
    try {
      await deleteAppeal(appeal.id);
      window.location.href = "/litigations";
    } catch (err) {
      setDeleteAppealError(
        err instanceof Error ? err.message : "Failed to delete litigation.",
      );
      setDeletingAppeal(false);
    }
  }

  function openAddMainEvent(procId: string) {
    setAddEventProcId(procId);
    setAddEventParentId(null);
    setEventCategory("");
    setEventDetails({});
    setEventDescription("");
    setEventError(null);
    setEventStatus("open");
    setEventNoticeNumber("");
    setAddEventPendingFiles([]);
    setAddEventFieldErrors({});
  }

  function openAddSubEvent(procId: string, masterEventId: string) {
    setAddEventProcId(procId);
    setAddEventParentId(masterEventId);
    setEventCategory("");
    setEventDetails({});
    setEventDescription("");
    setEventError(null);
    setEventStatus("open");
    setEventNoticeNumber("");
    setAddEventPendingFiles([]);
    setAddEventFieldErrors({});
  }

  function handleEventCategoryChange(cat: string) {
    setEventCategory(cat);
    const baseDetails: Record<string, string> = {};
    if (addEventParentId) {
      const parent = allEventsById[addEventParentId];
      if (parent) {
        // Default the sub-event's primary date to the parent main event's
        // DIN/notice date, so the user doesn't have to re-enter it — still editable.
        const parentDateField = PARENT_DATE_FIELD[parent.category];
        const parentDinDate =
          (parentDateField ? parent.details?.[parentDateField.key] : null) ||
          parent.event_date ||
          undefined;
        if (parentDinDate) {
          const effectiveCat = cat === "others" ? "others_sub" : cat;
          const primaryKey = PRIMARY_DATE[effectiveCat];
          if (primaryKey) {
            baseDetails[primaryKey] = parentDinDate;
          }
        }
        const parentDueDate = parent.details?.due_date;
        if (cat === "response_to_notice" && parentDueDate) {
          baseDetails["due_date"] = parentDueDate;
        }
      }
    }
    setEventDetails(baseDetails);
    setAddEventFieldErrors({});
  }

  function setDetail(key: string, value: string) {
    setEventDetails((prev) => ({ ...prev, [key]: value }));
    setAddEventFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!addEventProcId || !eventCategory) {
      setEventError("Category is required.");
      return;
    }
    const isSubEvent = addEventParentId !== null;
    const effectiveCategory =
      isSubEvent && eventCategory === "others" ? "others_sub" : eventCategory;
    const primaryKey = PRIMARY_DATE[effectiveCategory];
    if (primaryKey && !eventDetails[primaryKey]) {
      const fieldLabel =
        CATEGORY_FIELDS[effectiveCategory]?.find((f) => f.key === primaryKey)
          ?.label ?? primaryKey;
      setAddEventFieldErrors({ [primaryKey]: `${fieldLabel} cannot be empty` });
      return;
    }
    setEventSaving(true);
    setEventError(null);
    try {
      const primaryDate =
        primaryKey && eventDetails[primaryKey]
          ? new Date(eventDetails[primaryKey]).toISOString()
          : undefined;

      const input: EventInput = {
        proceeding_id: addEventProcId,
        event_type: isSubEvent ? "sub" : "main",
        category: eventCategory === "others_sub" ? "others" : eventCategory,
        parent_event_id: addEventParentId || undefined,
        event_date: primaryDate,
        status: eventStatus,
        event_notice_number: eventNoticeNumber || undefined,
        description: eventDescription || undefined,
        details: eventDetails,
      };
      const eventId = await addEvent(input);
      if (addEventPendingFiles.length > 0) {
        const supabase = createClient();
        for (const { file, desc } of addEventPendingFiles) {
          const path = `event-docs/${eventId}/${Date.now()}-${sanitizeFileName(file.name)}`;
          const { data, error: upErr } = await supabase.storage
            .from("org-files")
            .upload(path, file, { upsert: true });
          if (upErr || !data)
            throw new Error(
              `"${file.name}": ${upErr?.message ?? "Upload failed"}`,
            );
          const { data: urlData } = supabase.storage
            .from("org-files")
            .getPublicUrl(data.path);
          await uploadEventDocument(
            eventId,
            file.name,
            urlData.publicUrl,
            file.size,
            desc.trim() || undefined,
          );
        }
      }
      setAddEventProcId(null);
      setAddEventParentId(null);
      setAddEventPendingFiles([]);
      router.refresh();
    } catch (err) {
      setEventError(
        err instanceof Error ? err.message : "Failed to add event.",
      );
    } finally {
      setEventSaving(false);
    }
  }

  const proceedingFormChange =
    (setter: React.Dispatch<React.SetStateAction<ProceedingInput>>) =>
    (field: keyof ProceedingInput, value: string) =>
      setter((prev) => ({ ...prev, [field]: value }));
  const proceedingMultiChange =
    (setter: React.Dispatch<React.SetStateAction<ProceedingInput>>) =>
    (field: keyof ProceedingInput, value: string[]) =>
      setter((prev) => ({ ...prev, [field]: value }));

  // ── ESC for delete confirm dialogs ──
  useEscHandler(() => setConfirmDeleteProc(null), !!confirmDeleteProc);
  useEscHandler(() => setConfirmDeleteEvent(null), !!confirmDeleteEvent);
  useEscHandler(() => {
    setConfirmDeleteAppeal(false);
    setDeleteAppealError(null);
  }, confirmDeleteAppeal);

  // ── isDirty flags for each modal ──
  const editAppealIsDirty =
    showEditAppeal &&
    (editClientId !== (clientOrg?.id ?? "") ||
      editFY !== (appeal.financial_year?.id ?? "") ||
      editAY !== (appeal.assessment_year?.id ?? "") ||
      editAct !== (appeal.act_regulation?.id ?? "") ||
      editAppealStatus !== (appeal.status ?? "open") ||
      editLitigationTypeId !== (appeal.litigation_type?.id ?? ""));
  const editProcIsDirty =
    !!editProc &&
    (JSON.stringify(editProcValues) !==
      JSON.stringify(editProcInitRef.current) ||
      JSON.stringify(editProcContacts) !==
        JSON.stringify(editProcContactsInitRef.current) ||
      JSON.stringify(editProcDemandIssues) !==
        JSON.stringify(editProcDemandInitRef.current));
  const addProcIsDirty =
    showAddProc &&
    (addProcPendingFiles.length > 0 ||
      addProcContacts.length > 0 ||
      addProcDemandIssues.length > 0 ||
      Object.values(addProcValues).some((v) =>
        Array.isArray(v) ? v.length > 0 : !!v,
      ));
  const editEventIsDirty =
    !!editEvent &&
    (editEventCategory !== editEventInitRef.current.category ||
      JSON.stringify(editEventDetails) !==
        JSON.stringify(editEventInitRef.current.details) ||
      editEventDescription !== editEventInitRef.current.description ||
      editEventStatus !== editEventInitRef.current.status ||
      editEventNoticeNumber !== editEventInitRef.current.noticeNumber ||
      editEventParentId !== editEventInitRef.current.parentId);
  const addEventIsDirty =
    !!addEventProcId &&
    (!!eventCategory ||
      Object.values(eventDetails).some((v) => !!v) ||
      !!eventDescription ||
      !!eventNoticeNumber ||
      addEventPendingFiles.length > 0);

  const sortedProceedings = [...(appeal.proceedings ?? [])]
    .filter((p) => !p.deleted_at)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  // Track which proceedings are expanded (collapsed by default)
  const [expandedProcs, setExpandedProcs] = useState<Set<string>>(new Set());
  const [demandIssuesByProc, setDemandIssuesByProc] = useState<
    Record<string, DemandIssue[]>
  >({});
  const [demandLoadedProcs, setDemandLoadedProcs] = useState<Set<string>>(
    new Set(),
  );

  async function loadDemandForProc(procId: string) {
    if (demandLoadedProcs.has(procId)) return;
    try {
      const issues = await getDemandIssues(procId);
      setDemandIssuesByProc((prev) => ({ ...prev, [procId]: issues }));
      setDemandLoadedProcs((prev) => new Set(prev).add(procId));
    } catch {
      /* silently ignore */
    }
  }

  function toggleProc(id: string) {
    const willExpand = !expandedProcs.has(id);
    setExpandedProcs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (willExpand) loadDemandForProc(id);
  }

  // Tracks which main event rows have their sub events expanded
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(
    new Set(),
  );
  function toggleMaster(id: string) {
    setExpandedMasters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Flat lookup of all events by ID — used to resolve parent main event for sub events
  const allEventsById = (appeal.proceedings ?? []).reduce(
    (acc, p) => {
      (p.events ?? [])
        .filter((e) => !e.deleted_at)
        .forEach((e) => {
          acc[e.id] = e as AppEvent;
        });
      return acc;
    },
    {} as Record<string, AppEvent>,
  );

  // Map: main event ID → count of live sub-events (used in delete confirmation dialog)
  const liveSubCountByParent = (appeal.proceedings ?? []).reduce(
    (acc, p) => {
      (p.events ?? [])
        .filter(
          (e) =>
            !(e as AppEvent).deleted_at &&
            (e as AppEvent).event_type === "sub" &&
            (e as AppEvent).parent_event_id,
        )
        .forEach((e) => {
          const pid = (e as AppEvent).parent_event_id!;
          acc[pid] = (acc[pid] ?? 0) + 1;
        });
      return acc;
    },
    {} as Record<string, number>,
  );

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* CE-APPEAL-CARD: outer card bg="bg-white", border="border-border", padding="p-5" */}
      {/* Appeal Header */}
      <div
        className="rounded-xl shadow-sm overflow-hidden"
        style={{
          background: "linear-gradient(to right, #363636 0%, #696969 100%)",
        }}
      >
        <div
          className={`grid ${detailHideAY ? "grid-cols-[2fr_3fr_1fr_110px_200px_142px]" : "grid-cols-[2fr_3fr_1fr_1fr_110px_200px_142px]"} items-center gap-4 px-6 py-5`}
        >
          <DetailRow
            label="Client"
            value={<span className="font-medium">{clientOrg?.name}</span>}
          />
          <DetailRow
            label="Act / Regulation"
            value={appeal.act_regulation?.name}
          />
          <DetailRow
            label="Financial Year"
            value={appeal.financial_year?.name}
          />
          {!detailHideAY && (
            <DetailRow
              label="Assessment Year"
              value={appeal.assessment_year?.name}
            />
          )}
          {/* Status — own fixed column, aligns with proceeding Status column */}
          <div className="ml-10">
            <p
              className="text-xs mb-0.5 text-white/70"
              style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
            >
              Status
            </p>
            {canEdit ? (
              <div
                className="relative inline-flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  value={appeal.status ?? "open"}
                  disabled={inlineSaving.appeal_status}
                  onChange={(e) => handleAppealStatusInline(e.target.value)}
                  className={`appearance-none bg-transparent border border-white/30 rounded-full pl-2.5 pr-7 py-0.5 text-sm font-semibold cursor-pointer focus:outline-none focus:border-white/50 disabled:opacity-50 ${
                    (appeal.status ?? "open") === "closed"
                      ? "text-gray-400"
                      : "text-blue-300"
                  }`}
                >
                  <option
                    value="open"
                    className="text-blue-700 bg-white font-normal"
                  >
                    Open
                  </option>
                  <option
                    value="closed"
                    className="text-gray-500 bg-white font-normal"
                  >
                    Closed
                  </option>
                </select>
                <svg
                  className="pointer-events-none absolute right-2 w-3 h-3 text-white/40 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            ) : (
              (() => {
                const s = STATUS_CFG[appeal.status ?? "open"];
                const textCls =
                  appeal.status === "in-progress"
                    ? "text-amber-400"
                    : (s?.cls.split(" ").find((c) => c.startsWith("text-")) ??
                      "text-white");
                return s ? (
                  <span className={`text-sm font-semibold ${textCls}`}>
                    {s.label}
                  </span>
                ) : null;
              })()
            )}
          </div>
          {/* Litigation Type — own fixed column */}
          <div>
            <p
              className="text-xs mb-0.5 text-white/70"
              style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
            >
              Litigation Type
            </p>
            {canEdit ? (
              <div
                className="relative inline-flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  value={appeal.litigation_type?.id ?? ""}
                  disabled={inlineSaving.appeal_litigation_type}
                  onChange={(e) => handleAppealLitigationTypeInline(e.target.value)}
                  className="appearance-none bg-transparent border border-white/30 rounded-full pl-2.5 pr-7 py-0.5 text-sm font-semibold cursor-pointer focus:outline-none focus:border-white/50 disabled:opacity-50 text-white/90 max-w-48 truncate"
                  title={appeal.litigation_type?.name || undefined}
                >
                  <option value="" className="text-secondary bg-white font-normal">
                    — Not set —
                  </option>
                  {(mastersByType["litigation_type"] ?? [])
                    .filter((m) => m.parent_id === appeal.act_regulation?.id)
                    .map((m) => (
                      <option key={m.id} value={m.id} className="text-heading bg-white font-normal">
                        {m.name}
                      </option>
                    ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2 w-3 h-3 text-white/40 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            ) : (
              <span className="text-sm font-semibold text-white/90">
                {appeal.litigation_type?.name ?? "—"}
              </span>
            )}
          </div>
          {/* Actions — own auto column, aligns with proceeding Actions column */}
          {canEdit ? (
            <div className="flex items-center justify-end gap-0.5 px-4">
              <button
                onClick={() => {
                  setEditClientId(clientOrg?.id ?? "");
                  setEditFY(appeal.financial_year?.id ?? "");
                  setEditAY(appeal.assessment_year?.id ?? "");
                  setEditAct(appeal.act_regulation?.id ?? "");
                  setEditAppealStatus(appeal.status ?? "open");
                  setEditLitigationTypeId(appeal.litigation_type?.id ?? "");
                  setAppealError(null);
                  setShowEditAppeal(true);
                }}
                title="Edit Litigation"
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white inline-flex"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setConfirmDeleteAppeal(true)}
                title="Delete Litigation"
                className="p-1.5 rounded hover:bg-red-900/20 transition-colors text-red-400 hover:text-red-300 inline-flex"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Proceedings */}
      {sortedProceedings.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-secondary text-sm">
          No proceedings yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedProceedings.map((proc, idx) => {
            const impCfg = proc.importance ? IMPORTANCE[proc.importance] : null;
            const outCfg = proc.possible_outcome
              ? OUTCOME[proc.possible_outcome]
              : null;
            const assignedNames = (proc.assigned_to_ids ?? [])
              .map((id) => teamMembers.find((m) => m.id === id))
              .filter(Boolean)
              .map((m) => `${m!.first_name} ${m!.last_name}`);
            const clientStaffNames = (proc.client_staff_ids ?? [])
              .map((id) => clientUsers.find((u) => u.id === id))
              .filter(Boolean)
              .map((u) => `${u!.first_name} ${u!.last_name}`);
            const guestNames = (proc.guest_ids ?? [])
              .map((id) => guestUsers.find((u) => u.id === id))
              .filter(Boolean)
              .map((u) => `${u!.first_name} ${u!.last_name}`);
            const sortedEvents = [...(proc.events ?? [])]
              .filter((e) => !e.deleted_at)
              .sort((a, b) => a.created_at.localeCompare(b.created_at));
            const procStatusCfg = STATUS_CFG[proc.status ?? "open"];
            const isExpanded = expandedProcs.has(proc.id);

            // CE-PROC-CARD: proceeding row within unified container
            return (
              <div
                key={proc.id}
                className="bg-white border border-border rounded-xl overflow-hidden shadow-sm"
              >
                {/* CE-PROC-HEADER: header row bg="bg-accent-light"(#F7F7F7) hover="bg-accent-tint-hover"(#E8E8E8) */}
                {/* ── Collapsed summary row (always visible) ── */}
                <div
                  className="grid items-center bg-[#696969] hover:bg-[#595959] transition-colors cursor-pointer select-none overflow-hidden"
                  style={{
                    gridTemplateColumns:
                      "1fr 124px 112px 100px 128px 90px 96px 110px auto",
                  }}
                  onClick={() => toggleProc(proc.id)}
                >
                  {/* COL 1 — chevron + number + name */}
                  <div className="flex items-center gap-3 px-5 py-4 min-w-0">
                    <svg
                      className={`w-4 h-4 shrink-0 text-white/60 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span className="text-xs text-white/70 font-medium bg-white/10 px-2 py-0.5 rounded shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="font-semibold text-white text-sm truncate" title={proc.proceeding_type?.name ?? undefined}>
                      {proc.proceeding_type?.name ?? "—"}
                    </span>
                  </div>

                  {/* COL 2 — Initiated On */}
                  <div className="py-4">
                    <DetailRow
                      label="Initiated On"
                      value={
                        proc.initiated_on ? fmtDate(proc.initiated_on) : "—"
                      }
                    />
                  </div>

                  {/* COL 3 — Limitation Date */}
                  <div className="py-4">
                    <DetailRow
                      label="Limitation Date"
                      value={
                        proc.to_be_completed_by
                          ? fmtDate(proc.to_be_completed_by)
                          : "—"
                      }
                    />
                  </div>

                  {/* COL 4 — Jurisdiction */}
                  <div className="py-4 min-w-0">
                    <DetailRow
                      label="Jurisdiction"
                      value={proc.authority_type || null}
                      truncate
                    />
                  </div>

                  {/* COL 5 — Possible Outcome */}
                  <div className="py-4" onClick={(e) => e.stopPropagation()}>
                    <p
                      className="text-xs mb-0.5 text-white/70"
                      style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
                    >
                      Outcome
                    </p>
                    {canEdit ? (
                      <div className="relative inline-flex items-center">
                        <select
                          value={proc.possible_outcome ?? ""}
                          disabled={
                            inlineSaving[`proc_${proc.id}_possible_outcome`]
                          }
                          onChange={(e) =>
                            handleProcInline(
                              proc,
                              "possible_outcome",
                              e.target.value,
                            )
                          }
                          className={`appearance-none bg-transparent border border-white/30 rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium cursor-pointer focus:outline-none focus:border-white/50 disabled:opacity-50 ${
                            proc.possible_outcome === "favourable"
                              ? "text-green-300"
                              : proc.possible_outcome === "doubtful"
                                ? "text-amber-300"
                                : proc.possible_outcome === "unfavourable"
                                  ? "text-red-300"
                                  : "text-white/60"
                          }`}
                          style={{ colorScheme: "light" }}
                        >
                          <option
                            value=""
                            className="text-gray-400 bg-white font-normal"
                          >
                            — None —
                          </option>
                          <option
                            value="favourable"
                            className="text-green-700 bg-white font-normal"
                          >
                            Favourable
                          </option>
                          <option
                            value="doubtful"
                            className="text-amber-700 bg-white font-normal"
                          >
                            Doubtful
                          </option>
                          <option
                            value="unfavourable"
                            className="text-red-700 bg-white font-normal"
                          >
                            Unfavourable
                          </option>
                        </select>
                        <svg
                          className="pointer-events-none absolute right-1.5 w-3 h-3 text-white/40 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    ) : outCfg ? (
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${outCfg.cls}`}
                      >
                        {outCfg.label}
                      </span>
                    ) : (
                      <p
                        className="text-sm text-white"
                        style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
                      >
                        —
                      </p>
                    )}
                  </div>

                  {/* COL 6 — Importance */}
                  <div
                    className="py-4 pl-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p
                      className="text-xs mb-0.5 text-white/70"
                      style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
                    >
                      Importance
                    </p>
                    {canEdit ? (
                      <div className="relative inline-flex items-center">
                        <select
                          value={proc.importance ?? ""}
                          disabled={inlineSaving[`proc_${proc.id}_importance`]}
                          onChange={(e) =>
                            handleProcInline(proc, "importance", e.target.value)
                          }
                          className={`appearance-none bg-transparent border border-white/30 rounded-full pl-2.5 pr-3 py-0.5 text-xs font-semibold cursor-pointer focus:outline-none focus:border-white/50 disabled:opacity-50 ${
                            proc.importance === "critical"
                              ? "text-red-300"
                              : proc.importance === "high"
                                ? "text-orange-300"
                                : proc.importance === "medium"
                                  ? "text-yellow-300"
                                  : proc.importance === "low"
                                    ? "text-green-300"
                                    : "text-white/60"
                          }`}
                          style={{ colorScheme: "light" }}
                        >
                          <option
                            value=""
                            className="text-gray-400 bg-white font-normal"
                          >
                            — None —
                          </option>
                          <option
                            value="critical"
                            className="text-red-700 bg-white font-normal"
                          >
                            Critical
                          </option>
                          <option
                            value="high"
                            className="text-orange-700 bg-white font-normal"
                          >
                            High
                          </option>
                          <option
                            value="medium"
                            className="text-yellow-700 bg-white font-normal"
                          >
                            Medium
                          </option>
                          <option
                            value="low"
                            className="text-green-700 bg-white font-normal"
                          >
                            Low
                          </option>
                        </select>
                        <svg
                          className="pointer-events-none absolute right-1.5 w-3 h-3 text-white/40 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-semibold ${
                          impCfg
                            ? impCfg.cls
                                .split(" ")
                                .filter((c) => c.startsWith("text-"))
                                .join(" ")
                            : "text-white/70"
                        }`}
                      >
                        {impCfg ? impCfg.label : "—"}
                      </span>
                    )}
                  </div>

                  {/* COL 7 — Mode */}
                  <div className="py-4 pl-4">
                    <p
                      className="text-xs mb-0.5 text-white/70"
                      style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
                    >
                      Mode
                    </p>
                    <span
                      className="text-xs text-white capitalize"
                      style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
                    >
                      {proc.mode ?? "—"}
                    </span>
                  </div>

                  {/* COL 8 — Status */}
                  <div
                    className="py-4 pl-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p
                      className="text-xs mb-0.5 text-white/70"
                      style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}
                    >
                      Status
                    </p>
                    {canEdit ? (
                      <div className="relative inline-flex items-center">
                        <select
                          value={proc.status ?? "open"}
                          disabled={inlineSaving[`proc_${proc.id}_status`]}
                          onChange={(e) =>
                            handleProcInline(proc, "status", e.target.value)
                          }
                          className={`appearance-none bg-transparent border border-white/30 rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium cursor-pointer focus:outline-none focus:border-white/50 disabled:opacity-50 ${
                            (proc.status ?? "open") === "closed"
                              ? "text-gray-400"
                              : "text-blue-300"
                          }`}
                          style={{ colorScheme: "light" }}
                        >
                          <option
                            value="open"
                            className="text-blue-700 bg-white font-normal"
                          >
                            Open
                          </option>
                          <option
                            value="closed"
                            className="text-gray-500 bg-white font-normal"
                          >
                            Closed
                          </option>
                        </select>
                        <svg
                          className="pointer-events-none absolute right-1.5 w-3 h-3 text-white/40 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-medium ${
                          procStatusCfg
                            ? procStatusCfg.cls
                                .split(" ")
                                .filter((c) => c.startsWith("text-"))
                                .join(" ")
                            : "text-white/70"
                        }`}
                      >
                        {procStatusCfg ? procStatusCfg.label : "—"}
                      </span>
                    )}
                  </div>

                  {/* COL 7 — Actions */}
                  <div
                    className="flex items-center gap-0.5 px-4 py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canEdit && (
                      <>
                        <button
                          onClick={() => {
                            openEditProc(proc);
                            setEditProcTab("contacts");
                          }}
                          title="Contacts"
                          className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white inline-flex"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            openEditProc(proc);
                            setEditProcTab("amount");
                          }}
                          title="Demand Details"
                          className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white inline-flex"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 3h12M6 8h12M6 13l8.5 8"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 13h3c3.866 0 7-3.134 7-7"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => openEditProc(proc)}
                          title="Edit Proceeding"
                          className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white inline-flex"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteProc(proc)}
                          title="Delete Proceeding"
                          className="p-1.5 rounded hover:bg-red-900/20 transition-colors text-red-400 hover:text-red-300 inline-flex"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Expanded content ── */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* CE-PROC-DETAILS: expanded details panel bg="bg-accent-tint"(#F0F0F0) divider="border-table-header"(#D2D2D2) */}
                    {/* Proceeding details */}
                    <div className="px-5 py-4 grid grid-cols-3 gap-x-6 gap-y-4 border-b border-table-header bg-white">
                      <DetailRow
                        light
                        label="Jurisdiction"
                        value={proc.authority_type || null}
                      />
                      <DetailRow
                        light
                        label="Authority Name"
                        value={proc.authority_name || null}
                      />
                      <DetailRow
                        light
                        label="Jurisdiction City"
                        value={proc.jurisdiction_city || null}
                      />
                      <DetailRow
                        light
                        label="Assigned To"
                        value={
                          assignedNames.length > 0
                            ? assignedNames.join(", ")
                            : null
                        }
                      />
                      <DetailRow
                        light
                        label="Client Staff"
                        value={
                          clientStaffNames.length > 0
                            ? clientStaffNames.join(", ")
                            : null
                        }
                      />
                      <DetailRow
                        light
                        label="Guest User"
                        value={
                          guestNames.length > 0 ? guestNames.join(", ") : null
                        }
                      />
                      <DetailRow
                        light
                        label="Possible Outcome"
                        value={
                          outCfg ? (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outCfg.cls}`}
                            >
                              {outCfg.label}
                            </span>
                          ) : null
                        }
                      />
                      {proc.gst_number && (
                        <DetailRow
                          light
                          label="GST Number"
                          value={proc.gst_number}
                        />
                      )}
                    </div>

                    {/* Proceeding Attachments */}
                    <ProceedingAttachments
                      proceedingId={proc.id}
                      docs={proc.proceeding_documents ?? []}
                      canEdit={canEdit}
                    />

                    {/* Events */}
                    {(() => {
                      function getMainEventSortDate(ev: AppEvent): string {
                        const cat = ev.category;
                        const pk = PRIMARY_DATE[cat];
                        if (pk && ev.details?.[pk]) return ev.details[pk];
                        const dk = DUE_DATE_KEY[cat];
                        if (dk && ev.details?.[dk]) return ev.details[dk];
                        if (ev.event_date) return ev.event_date;
                        return ev.created_at;
                      }
                      function getSubEventSortDate(ev: AppEvent): string {
                        const effectiveCat =
                          ev.category === "others" ? "others_sub" : ev.category;
                        const pk = PRIMARY_DATE[effectiveCat];
                        if (pk && ev.details?.[pk]) return ev.details[pk];
                        const dk = DUE_DATE_KEY[effectiveCat];
                        if (dk && ev.details?.[dk]) return ev.details[dk];
                        if (ev.event_date) return ev.event_date;
                        return ev.created_at;
                      }
                      const mainEvents = sortedEvents
                        .filter((e) => e.event_type === "main")
                        .sort((a, b) =>
                          getMainEventSortDate(b).localeCompare(
                            getMainEventSortDate(a),
                          ),
                        );
                      const subEventsByParent: Record<string, AppEvent[]> = {};
                      const orphanedSubs: AppEvent[] = [];
                      sortedEvents
                        .filter((e) => e.event_type === "sub")
                        .forEach((e) => {
                          if (e.parent_event_id) {
                            if (!subEventsByParent[e.parent_event_id])
                              subEventsByParent[e.parent_event_id] = [];
                            subEventsByParent[e.parent_event_id].push(e);
                          } else {
                            orphanedSubs.push(e);
                          }
                        });
                      // Sort each parent's sub-events latest → oldest by primary date
                      Object.values(subEventsByParent).forEach((arr) =>
                        arr.sort((a, b) =>
                          getSubEventSortDate(b).localeCompare(
                            getSubEventSortDate(a),
                          ),
                        ),
                      );

                      function EventActions({ ev }: { ev: AppEvent }) {
                        return (
                          <div
                            className="flex items-center gap-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setViewEvent(ev)}
                              title="View"
                              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => setConfirmDeleteEvent(ev)}
                                  title="Delete"
                                  className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        );
                      }

                      const EVENT_GRID =
                        "1fr 156px 148px 130px 116px 56px 104px";
                      const LEFT_INNER = "14px auto 1fr";

                      function EventRow({
                        ev,
                        isSub,
                        subIdx,
                      }: {
                        ev: AppEvent;
                        isSub?: boolean;
                        subIdx?: number;
                      }) {
                        const effectiveCat =
                          ev.event_type === "sub" && ev.category === "others"
                            ? "others_sub"
                            : ev.category;
                        const primaryKey = PRIMARY_DATE[effectiveCat];
                        const noticeDate =
                          primaryKey && ev.details?.[primaryKey]
                            ? fmtDate(ev.details[primaryKey])
                            : ev.event_date
                              ? fmtDate(ev.event_date)
                              : "—";
                        const dueDateKey = DUE_DATE_KEY[effectiveCat];
                        const dueDate =
                          dueDateKey && ev.details?.[dueDateKey]
                            ? fmtDate(ev.details[dueDateKey])
                            : "—";
                        const internalTargetDate = ev.details
                          ?.internal_target_date
                          ? fmtDate(ev.details.internal_target_date)
                          : "—";
                        const statusCfg =
                          EVENT_STATUS_CFG[ev.status ?? "open"] ??
                          EVENT_STATUS_CFG.open;
                        const statusTextCls = statusCfg.cls
                          .split(" ")
                          .filter((c) => c.startsWith("text-"))
                          .join(" ");
                        const cnt = (ev.event_documents ?? []).filter(
                          (d) => !d.deleted_at,
                        ).length;
                        return (
                          <div
                            className="grid items-center bg-white hover:bg-surface-hover transition-colors border-t border-surface-hover cursor-pointer"
                            style={{ gridTemplateColumns: EVENT_GRID }}
                            onClick={() =>
                              canEdit ? openEditEvent(ev) : setViewEvent(ev)
                            }
                          >
                            <div
                              className="grid items-center gap-2 pl-8 pr-4 py-1.5 min-w-0"
                              style={{ gridTemplateColumns: LEFT_INNER }}
                            >
                              <div />{" "}
                              {/* empty chevron slot — aligns with main row chevron */}
                              <span className="inline-flex justify-center px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 bg-accent-light text-accent">
                                SE{(subIdx ?? 0) + 1}
                              </span>
                              <span className="text-xs text-heading font-medium min-w-0 truncate" title={getEventLabel(ev.category, ev.details)}>
                                {getEventLabel(ev.category, ev.details)}
                              </span>
                            </div>
                            <div className="py-1.5">
                              <span className="text-xs text-secondary">
                                {noticeDate}
                              </span>
                            </div>
                            <div className="py-1.5">
                              <span className="text-xs text-secondary">
                                {internalTargetDate}
                              </span>
                            </div>
                            <div className="py-1.5">
                              <span className="text-xs text-secondary">
                                {dueDate}
                              </span>
                            </div>
                            <div
                              className="py-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canEdit ? (
                                <div className="relative inline-flex items-center">
                                  <select
                                    value={ev.status ?? "open"}
                                    disabled={
                                      inlineSaving[`event_${ev.id}_status`]
                                    }
                                    onChange={(e) =>
                                      handleEventStatusInline(
                                        ev,
                                        proc.id,
                                        e.target.value,
                                      )
                                    }
                                    className={`appearance-none bg-transparent border border-border rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 ${statusTextCls}`}
                                  >
                                    <option
                                      value="open"
                                      className="text-blue-700 bg-white font-normal"
                                    >
                                      Open
                                    </option>
                                    <option
                                      value="closed"
                                      className="text-gray-500 bg-white font-normal"
                                    >
                                      Closed
                                    </option>
                                  </select>
                                  <svg
                                    className="pointer-events-none absolute right-1.5 w-3 h-3 text-muted shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19 9l-7 7-7-7"
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <span
                                  className={`text-xs font-medium ${statusTextCls}`}
                                >
                                  {statusCfg.label}
                                </span>
                              )}
                            </div>
                            <div className="py-1.5 flex items-center">
                              <span className="inline-flex items-center gap-0.5 text-xs text-secondary">
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                  />
                                </svg>
                                {cnt}
                              </span>
                            </div>
                            <div className="py-1.5 pr-4">
                              <EventActions ev={ev} />
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="px-5 py-4 bg-accent-tint">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
                              Events ({mainEvents.length})
                            </p>
                            {canEdit && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAddMainEvent(proc.id);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg transition"
                              >
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                                Add Main Event
                              </button>
                            )}
                          </div>

                          {sortedEvents.length === 0 ? (
                            <p className="text-xs text-muted">
                              No events recorded yet.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {/* Column headers */}
                              <div
                                className="grid items-center bg-table-header rounded-lg text-xs font-semibold text-heading"
                                style={{
                                  gridTemplateColumns: EVENT_GRID,
                                }}
                              >
                                <div className="px-4 py-1.5">Event</div>
                                <div className="py-1.5">Document Date</div>
                                <div className="py-1.5">Target Date</div>
                                <div className="py-1.5">Due Date</div>
                                <div className="py-1.5">Status</div>
                                <div className="py-1.5">Docs</div>
                                <div className="py-1.5 pr-4">Actions</div>
                              </div>
                              {/* Main events with their sub events */}
                              {mainEvents.map((master, mIdx) => {
                                const subs = subEventsByParent[master.id] ?? [];
                                const isSubsExpanded = expandedMasters.has(
                                  master.id,
                                );
                                return (
                                  <div
                                    key={master.id}
                                    className="rounded-lg border border-border overflow-hidden"
                                  >
                                    {/* Main row — click to expand/collapse sub events */}
                                    {(() => {
                                      const effectiveCat = master.category;
                                      const primaryKey =
                                        PRIMARY_DATE[effectiveCat];
                                      const noticeDate =
                                        primaryKey &&
                                        master.details?.[primaryKey]
                                          ? fmtDate(master.details[primaryKey])
                                          : master.event_date
                                            ? fmtDate(master.event_date)
                                            : "—";
                                      const dueDateKey =
                                        DUE_DATE_KEY[effectiveCat];
                                      const dueDate =
                                        dueDateKey &&
                                        master.details?.[dueDateKey]
                                          ? fmtDate(master.details[dueDateKey])
                                          : "—";
                                      const internalTargetDate = master.details
                                        ?.internal_target_date
                                        ? fmtDate(
                                            master.details.internal_target_date,
                                          )
                                        : "—";
                                      const statusCfg =
                                        EVENT_STATUS_CFG[
                                          master.status ?? "open"
                                        ] ?? EVENT_STATUS_CFG.open;
                                      const statusTextCls = statusCfg.cls
                                        .split(" ")
                                        .filter((c) => c.startsWith("text-"))
                                        .join(" ");
                                      const cnt = (
                                        master.event_documents ?? []
                                      ).filter((d) => !d.deleted_at).length;
                                      return (
                                        <div
                                          className="grid items-center bg-white hover:bg-surface-hover transition-colors cursor-pointer"
                                          style={{
                                            gridTemplateColumns: EVENT_GRID,
                                          }}
                                          onClick={() =>
                                            toggleMaster(master.id)
                                          }
                                        >
                                          <div
                                            className="grid items-center gap-2 px-4 py-2.5 min-w-0"
                                            style={{
                                              gridTemplateColumns: LEFT_INNER,
                                            }}
                                          >
                                            <svg
                                              className={`w-3.5 h-3.5 shrink-0 text-muted transition-transform duration-150 ${isSubsExpanded ? "rotate-90" : ""}`}
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                              strokeWidth={2.5}
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M9 5l7 7-7 7"
                                              />
                                            </svg>
                                            <span className="inline-flex justify-center px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 bg-accent-light text-accent">
                                              ME{mainEvents.length - mIdx}
                                            </span>
                                            <span
                                              className="text-xs text-heading font-bold min-w-0 truncate"
                                              title={getEventLabel(
                                                master.category,
                                                master.details,
                                              )}
                                            >
                                              {getEventLabel(
                                                master.category,
                                                master.details,
                                              )}
                                            </span>
                                          </div>
                                          <div className="py-2.5">
                                            <span className="text-xs text-secondary font-semibold">
                                              {noticeDate}
                                            </span>
                                          </div>
                                          <div className="py-2.5">
                                            <span className="text-xs text-secondary font-semibold">
                                              {internalTargetDate}
                                            </span>
                                          </div>
                                          <div className="py-2.5">
                                            <span className="text-xs text-secondary font-semibold">
                                              {dueDate}
                                            </span>
                                          </div>
                                          <div
                                            className="py-2.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {canEdit ? (
                                              <div className="relative inline-flex items-center">
                                                <select
                                                  value={
                                                    master.status ?? "open"
                                                  }
                                                  disabled={
                                                    inlineSaving[
                                                      `event_${master.id}_status`
                                                    ]
                                                  }
                                                  onChange={(e) =>
                                                    handleEventStatusInline(
                                                      master,
                                                      proc.id,
                                                      e.target.value,
                                                    )
                                                  }
                                                  className={`appearance-none bg-transparent border border-border rounded-full pl-2.5 pr-6 py-0.5 text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 ${statusTextCls}`}
                                                >
                                                  <option
                                                    value="open"
                                                    className="text-blue-700 bg-white font-normal"
                                                  >
                                                    Open
                                                  </option>
                                                  <option
                                                    value="closed"
                                                    className="text-gray-500 bg-white font-normal"
                                                  >
                                                    Closed
                                                  </option>
                                                </select>
                                                <svg
                                                  className="pointer-events-none absolute right-1.5 w-3 h-3 text-muted shrink-0"
                                                  fill="none"
                                                  viewBox="0 0 24 24"
                                                  stroke="currentColor"
                                                  strokeWidth={2.5}
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M19 9l-7 7-7-7"
                                                  />
                                                </svg>
                                              </div>
                                            ) : (
                                              <span
                                                className={`text-xs font-bold ${statusTextCls}`}
                                              >
                                                {statusCfg.label}
                                              </span>
                                            )}
                                          </div>
                                          <div className="py-2.5 flex items-center">
                                            <span className="inline-flex items-center gap-0.5 text-xs text-secondary font-semibold">
                                              <svg
                                                className="w-3.5 h-3.5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                                />
                                              </svg>
                                              {cnt}
                                            </span>
                                          </div>
                                          <div
                                            className="py-2.5 pr-4"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="flex items-center gap-0.5">
                                              <button
                                                onClick={() =>
                                                  setViewEvent(master)
                                                }
                                                title="View"
                                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex"
                                              >
                                                <svg
                                                  className="w-3.5 h-3.5"
                                                  fill="none"
                                                  viewBox="0 0 24 24"
                                                  stroke="currentColor"
                                                  strokeWidth={2}
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                  />
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                  />
                                                </svg>
                                              </button>
                                              {canEdit && (
                                                <>
                                                  <button
                                                    onClick={() =>
                                                      openEditEvent(master)
                                                    }
                                                    title="Edit"
                                                    className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex"
                                                  >
                                                    <svg
                                                      className="w-3.5 h-3.5"
                                                      fill="none"
                                                      viewBox="0 0 24 24"
                                                      stroke="currentColor"
                                                      strokeWidth={2}
                                                    >
                                                      <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                      />
                                                    </svg>
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      setConfirmDeleteEvent(
                                                        master,
                                                      )
                                                    }
                                                    title="Delete"
                                                    className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex"
                                                  >
                                                    <svg
                                                      className="w-3.5 h-3.5"
                                                      fill="none"
                                                      viewBox="0 0 24 24"
                                                      stroke="currentColor"
                                                      strokeWidth={2}
                                                    >
                                                      <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                      />
                                                    </svg>
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Sub events + Add Sub Event — shown when main row is expanded */}
                                    {isSubsExpanded && (
                                      <>
                                        {subs.map((sub, subIdx) => (
                                          <EventRow
                                            key={sub.id}
                                            ev={sub}
                                            isSub
                                            subIdx={subIdx}
                                          />
                                        ))}
                                        {canEdit && (
                                          <div
                                            className="pl-8 pr-3 py-1.5 bg-white border-t border-surface-hover"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              onClick={() =>
                                                openAddSubEvent(
                                                  proc.id,
                                                  master.id,
                                                )
                                              }
                                              className="inline-flex items-center gap-1 text-xs text-secondary hover:text-accent transition-colors"
                                            >
                                              <svg
                                                className="w-3 h-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2.5}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M12 4v16m8-8H4"
                                                />
                                              </svg>
                                              Add Sub Event
                                            </button>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                              {/* Orphaned sub events (legacy — no parent) */}
                              {orphanedSubs.map((ev, subIdx) => (
                                <EventRow
                                  key={ev.id}
                                  ev={ev}
                                  isSub
                                  subIdx={subIdx}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Proceeding */}
      {canEdit && (
        <button
          onClick={() => {
            setAddProcValues({});
            setAddProcError(null);
            setAddProcDemandIssues([]);
            setAddProcTab("details");
            setShowAddProc(true);
          }}
          className="w-full py-3 cursor-pointer border-2 border-dashed border-border rounded-xl text-sm text-secondary hover:border-primary hover:text-primary transition flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Proceeding
        </button>
      )}

      {/* ── Edit Appeal Modal ── */}
      {showEditAppeal && (
        <Modal
          title="Edit Litigation"
          onClose={() => setShowEditAppeal(false)}
          isDirty={editAppealIsDirty}
        >
          <form onSubmit={handleSaveAppeal} className="space-y-4">
            <Field label="Client Organisation">
              <select
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                className={inp}
              >
                <option value="">Select client…</option>
                {[...clients]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Act / Regulation" fullWidth>
                <select
                  value={editAct}
                  onChange={(e) => handleEditActChange(e.target.value)}
                  className={inp}
                >
                  <option value="">Select…</option>
                  {[...(mastersByType["act_regulation"] ?? [])]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label={
                  editIsITAct2025 ? "Tax Year" : "Financial Year / Tax Year"
                }
                fullWidth={editHideAY}
              >
                <select
                  value={editFY}
                  onChange={(e) => handleEditFYChange(e.target.value)}
                  className={inp}
                  disabled={!editAct}
                >
                  <option value="">
                    {editAct ? "Select…" : "Select Act first"}
                  </option>
                  {[...editAvailableFY]
                    .sort((a, b) => b.name.localeCompare(a.name))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
              {!editHideAY && (
                <Field label="Assessment Year">
                  <div className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-surface-hover border-border text-secondary cursor-not-allowed">
                    {editAYName}
                  </div>
                </Field>
              )}
              <Field label="Status">
                <select
                  value={editAppealStatus}
                  onChange={(e) => setEditAppealStatus(e.target.value)}
                  className={inp}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Litigation Type">
                <select
                  value={editLitigationTypeId}
                  onChange={(e) => setEditLitigationTypeId(e.target.value)}
                  className={inp}
                  disabled={!editAct || editAvailableLitigationTypes.length === 0}
                >
                  <option value="">
                    {!editAct
                      ? "Select Act first"
                      : editAvailableLitigationTypes.length === 0
                        ? "No litigation types configured for this Act"
                        : "— Not set —"}
                  </option>
                  {editAvailableLitigationTypes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {appealError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {appealError}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowEditAppeal(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={appealSaving}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {appealSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Proceeding Modal ── */}
      {editProc && (
        <Modal
          title="Edit Proceeding"
          onClose={() => setEditProc(null)}
          isDirty={editProcIsDirty}
          size="xl"
        >
          <form
            onSubmit={handleSaveProc}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Tab strip — fixed, never scrolls */}
            <div className="flex border-b border-border px-6 shrink-0">
              {(["details", "contacts", "amount"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditProcTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${editProcTab === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-heading"}`}
                >
                  {tab === "details" ? (
                    "Proceeding"
                  ) : tab === "contacts" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      Contacts
                      {editProcContacts.length > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 text-xs bg-accent-light text-accent rounded-full font-semibold">
                          {editProcContacts.length}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 3h12M6 8h12M6 13l8.5 8"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 13h3c3.866 0 7-3.134 7-7"
                        />
                      </svg>
                      Demand
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* Scrollable tab content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Details tab */}
              <div
                className={
                  editProcTab === "details" ? "block space-y-4" : "hidden"
                }
              >
                <ProceedingFormFields
                  values={editProcValues}
                  onChange={proceedingFormChange(setEditProcValues)}
                  onMultiChange={proceedingMultiChange(setEditProcValues)}
                  mastersByType={mastersByType}
                  teamMembers={teamMembers}
                  clientUsers={clientUsers}
                  guestUsers={guestUsers}
                  actRegulationId={appeal.act_regulation?.id ?? undefined}
                  clientPan={clientPan}
                  clientGstNumbers={clientGstNumbers}
                />
                <div className="border-t border-border -mx-6 px-6 pt-4">
                  <ProceedingAttachments
                    proceedingId={editProc.id}
                    docs={editProc.proceeding_documents ?? []}
                    canEdit={canEdit}
                  />
                </div>
              </div>
              {/* Contacts tab */}
              <div className={editProcTab === "contacts" ? "block" : "hidden"}>
                <ProceedingContactsTab
                  contacts={editProcContacts}
                  onChange={setEditProcContacts}
                  canEdit={canEdit}
                />
              </div>
              {/* Demand tab */}
              <div className={editProcTab === "amount" ? "block" : "hidden"}>
                <DemandIssuesEditor
                  issues={editProcDemandIssues}
                  onChange={setEditProcDemandIssues}
                  mainEvents={editProc.events}
                />
              </div>
              {editProcError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {editProcError}
                </div>
              )}
            </div>
            {/* Footer — fixed, never scrolls */}
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => setEditProc(null)}
                className="px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editProcSaving}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {editProcSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Add Proceeding Modal ── */}
      {showAddProc && (
        <Modal
          title="Add Proceeding"
          onClose={() => {
            setShowAddProc(false);
            setAddProcPendingFiles([]);
            setAddProcContacts([]);
            setAddProcDemandIssues([]);
            setAddProcTab("details");
          }}
          isDirty={addProcIsDirty}
          size="lg"
        >
          <form
            onSubmit={handleAddProc}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Tab strip — fixed, never scrolls */}
            <div className="flex border-b border-border px-6 shrink-0">
              {(["details", "contacts", "amount"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAddProcTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${addProcTab === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-heading"}`}
                >
                  {tab === "details" ? (
                    "Proceeding Details"
                  ) : tab === "contacts" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      Contacts
                      {addProcContacts.length > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 text-xs bg-accent-light text-accent rounded-full font-semibold">
                          {addProcContacts.length}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 3h12M6 8h12M6 13l8.5 8"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 13h3c3.866 0 7-3.134 7-7"
                        />
                      </svg>
                      Demand
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* Scrollable tab content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Details tab */}
              <div
                className={
                  addProcTab === "details" ? "block space-y-4" : "hidden"
                }
              >
                <ProceedingFormFields
                  values={addProcValues}
                  onChange={proceedingFormChange(setAddProcValues)}
                  onMultiChange={proceedingMultiChange(setAddProcValues)}
                  mastersByType={mastersByType}
                  teamMembers={teamMembers}
                  clientUsers={clientUsers}
                  guestUsers={guestUsers}
                  actRegulationId={appeal.act_regulation?.id ?? undefined}
                  clientPan={clientPan}
                  clientGstNumbers={clientGstNumbers}
                />
                <PendingAttachments
                  files={addProcPendingFiles}
                  onChange={setAddProcPendingFiles}
                />
              </div>
              {/* Contacts tab */}
              <div className={addProcTab === "contacts" ? "block" : "hidden"}>
                <ProceedingContactsTab
                  contacts={addProcContacts}
                  onChange={setAddProcContacts}
                  canEdit={canEdit}
                />
              </div>
              {/* Demand tab */}
              <div className={addProcTab === "amount" ? "block" : "hidden"}>
                <DemandIssuesEditor
                  issues={addProcDemandIssues}
                  onChange={setAddProcDemandIssues}
                />
              </div>
              {addProcError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {addProcError}
                </div>
              )}
            </div>
            {/* Footer — fixed, never scrolls */}
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAddProc(false);
                  setAddProcPendingFiles([]);
                  setAddProcContacts([]);
                  setAddProcDemandIssues([]);
                  setAddProcTab("details");
                }}
                className="px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addProcSaving}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {addProcSaving ? "Adding…" : "Add Proceeding"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Quick View Event Modal ── */}
      {viewEvent && (
        <Modal
          title={getEventLabel(viewEvent.category, viewEvent.details)}
          onClose={() => setViewEvent(null)}
          isDirty={false}
        >
          <div className="space-y-5">
            {/* Event type, notice number, status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${viewEvent.event_type === "sub" ? "bg-purple-50 text-purple-700" : "bg-accent-light text-accent"}`}
              >
                {viewEvent.event_type === "sub" ? "Sub Event" : "Main Event"}
              </span>
              {viewEvent.event_notice_number && (
                <span className="text-xs text-secondary">
                  Order No:{" "}
                  <span className="font-medium text-heading">
                    {viewEvent.event_notice_number}
                  </span>
                </span>
              )}
              {(() => {
                const s =
                  EVENT_STATUS_CFG[viewEvent.status ?? "open"] ??
                  EVENT_STATUS_CFG.open;
                return (
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}
                  >
                    {s.label}
                  </span>
                );
              })()}
            </div>

            {/* Inherited from parent main event (sub events only) */}
            {viewEvent.event_type === "sub" &&
              viewEvent.parent_event_id &&
              (() => {
                const parent = allEventsById[viewEvent.parent_event_id];
                if (!parent) return null;
                const parentDateField = PARENT_DATE_FIELD[parent.category];
                const parentDateKey = parentDateField?.key;
                const parentDateLabel = parentDateField?.label ?? "Date";
                const parentNoticeDate =
                  parentDateKey && parent.details?.[parentDateKey]
                    ? fmtDateTime(parent.details[parentDateKey])
                    : parent.event_date
                      ? fmtDateTime(parent.event_date)
                      : null;
                return (
                  <div className="rounded-lg bg-surface-hover border border-border px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted mb-0.5">Order No.</p>
                        <p className="text-sm text-muted">
                          {parent.event_notice_number
                            ? `#${parent.event_notice_number}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-0.5">
                          {parentDateLabel}
                        </p>
                        <p className="text-sm text-muted">
                          {parentNoticeDate ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            {/* Category-specific fields */}
            {CATEGORY_FIELDS[viewEvent.category] && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {CATEGORY_FIELDS[viewEvent.category].map((field) => {
                  const rawVal = viewEvent.details?.[field.key];
                  let display: React.ReactNode = (
                    <span className="text-muted">—</span>
                  );
                  if (rawVal) {
                    if (field.type === "datetime") {
                      display = fmtDateTime(rawVal);
                    } else if (field.type === "date") {
                      display = fmtDate(rawVal);
                    } else if (field.type === "select") {
                      const opt = field.options?.find(
                        (o) => o.value === rawVal,
                      );
                      display = opt?.label ?? rawVal;
                    } else if (field.type === "proceeding_select") {
                      const proc = (
                        mastersByType["proceeding_type"] ?? []
                      ).find((m) => m.id === rawVal);
                      display = proc?.name ?? rawVal;
                    } else {
                      display = rawVal;
                    }
                  }
                  return (
                    <div
                      key={field.key}
                      className={field.fullWidth ? "col-span-2" : ""}
                    >
                      <p className="text-xs text-muted mb-0.5">{field.label}</p>
                      <p className="text-sm text-heading">{display}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Notes */}
            {viewEvent.description && (
              <div className="pt-3 border-t border-surface-hover">
                <p className="text-xs text-muted mb-0.5">Notes</p>
                <p className="text-sm text-heading italic">
                  {viewEvent.description}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              {canEdit && (
                <button
                  onClick={() => {
                    setViewEvent(null);
                    openEditEvent(viewEvent);
                  }}
                  className="px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => setViewEvent(null)}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Event Modal ── */}
      {editEvent && (
        <Modal
          title={`Edit — ${getEventLabel(editEventCategory, editEventDetails)}`}
          onClose={() => setEditEvent(null)}
          isDirty={editEventIsDirty}
        >
          <form onSubmit={handleSaveEvent} className="space-y-5">
            {/* Category (read-only display, can't change category as it would break field semantics) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary font-medium">
                Category:
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-light text-accent">
                {getEventLabel(editEventCategory, editEventDetails)}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${editEventType === "sub" ? "bg-purple-50 text-purple-700" : "bg-accent-light text-accent"}`}
              >
                {editEventType === "sub" ? "Sub Event" : "Main Event"}
              </span>
            </div>

            {/* Category Name — shown only when category is Others */}
            {(editEventCategory === "others" ||
              editEventCategory === "others_sub") && (
              <Field label="Category Name *">
                <input
                  type="text"
                  value={editEventDetails["category_name"] ?? ""}
                  onChange={(e) =>
                    setEditDetail("category_name", e.target.value)
                  }
                  placeholder="Enter category name…"
                  className={inp}
                />
              </Field>
            )}

            {/* Order Number / Notice Number — main events only, not shown for Others */}
            {editEventType === "main" && editEventCategory !== "others" && (
              <Field
                label={
                  NOTICE_NUMBER_FIELD_LABEL[editEventCategory] ?? "Order Number"
                }
              >
                <input
                  type="text"
                  value={editEventNoticeNumber}
                  onChange={(e) => setEditEventNoticeNumber(e.target.value)}
                  className={inp}
                />
              </Field>
            )}

            {/* Parent Main Event selector — sub events only */}
            {editEventType === "sub" &&
              (() => {
                const proc = (appeal.proceedings ?? []).find(
                  (p) => p.id === editEventProceedingId,
                );
                const mainEvents = [...(proc?.events ?? [])]
                  .filter((e) => e.event_type === "main" && !e.deleted_at)
                  .sort((a, b) => a.created_at.localeCompare(b.created_at));
                const selectedParent = editEventParentId
                  ? allEventsById[editEventParentId]
                  : null;
                const parentDateField = selectedParent
                  ? PARENT_DATE_FIELD[selectedParent.category]
                  : null;
                const parentDateKey = parentDateField?.key ?? null;
                const parentDateLabel = parentDateField?.label ?? "Date";
                const parentNoticeDate =
                  selectedParent &&
                  parentDateKey &&
                  selectedParent.details?.[parentDateKey]
                    ? selectedParent.details[parentDateKey]
                    : (selectedParent?.event_date ?? "");
                return (
                  <div className="space-y-3">
                    <Field label="Parent Main Event">
                      <select
                        value={editEventParentId ?? ""}
                        onChange={(e) =>
                          setEditEventParentId(e.target.value || null)
                        }
                        className={inp}
                      >
                        <option value="">— None (unlinked) —</option>
                        {mainEvents.map((m, mIdx) => (
                          <option key={m.id} value={m.id}>
                            #ME{mainEvents.length - mIdx} —{" "}
                            {getEventLabel(m.category, m.details)}
                            {m.event_notice_number
                              ? ` (Order #${m.event_notice_number})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {selectedParent && (
                      <div className="rounded-lg bg-surface-hover border border-border px-4 py-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-secondary mb-1.5">
                              Order No.
                            </label>
                            <input
                              readOnly
                              value={selectedParent.event_notice_number ?? ""}
                              placeholder="—"
                              className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-surface-hover border-border text-muted cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-secondary mb-1.5">
                              {parentDateLabel}
                            </label>
                            <input
                              readOnly
                              value={
                                parentNoticeDate
                                  ? parentNoticeDate.slice(0, 10)
                                  : ""
                              }
                              placeholder="—"
                              type="date"
                              className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-surface-hover border-border text-muted cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Dynamic category fields */}
            {editEventCategory && CATEGORY_FIELDS[editEventCategory] && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-surface-hover">
                {(() => {
                  const editEffectiveCat =
                    editEventType === "sub" && editEventCategory === "others"
                      ? "others_sub"
                      : editEventCategory;
                  const editPrimaryKey = PRIMARY_DATE[editEffectiveCat];
                  return CATEGORY_FIELDS[editEventCategory].map((field) => {
                    const isReq = field.key === editPrimaryKey;
                    const fieldErr = editEventFieldErrors[field.key];
                    const cls = isReq && fieldErr ? inpErr : inp;
                    return (
                      <Field
                        key={field.key}
                        label={field.label}
                        fullWidth={field.fullWidth}
                        required={isReq}
                        error={fieldErr}
                      >
                        {field.type === "datetime" && (
                          <DateTimeField
                            value={editEventDetails[field.key] ?? ""}
                            onChange={(v) => setEditDetail(field.key, v)}
                          />
                        )}
                        {field.type === "date" && (
                          <input
                            type="date"
                            value={(editEventDetails[field.key] ?? "").slice(
                              0,
                              10,
                            )}
                            onChange={(e) =>
                              setEditDetail(field.key, e.target.value)
                            }
                            className={cls}
                          />
                        )}
                        {field.type === "text" && (
                          <input
                            type="text"
                            value={editEventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setEditDetail(field.key, e.target.value)
                            }
                            className={cls}
                          />
                        )}
                        {field.type === "textarea" && (
                          <textarea
                            value={editEventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setEditDetail(field.key, e.target.value)
                            }
                            rows={3}
                            className={`${cls} resize-none`}
                          />
                        )}
                        {field.type === "select" && (
                          <select
                            value={editEventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setEditDetail(field.key, e.target.value)
                            }
                            className={cls}
                          >
                            <option value="">Select…</option>
                            {field.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {field.type === "proceeding_select" && (
                          <select
                            value={editEventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setEditDetail(field.key, e.target.value)
                            }
                            className={cls}
                          >
                            <option value="">Select…</option>
                            {[...(mastersByType["proceeding_type"] ?? [])]
                              .filter(
                                (m) =>
                                  m.parent_id === appeal.act_regulation?.id,
                              )
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </Field>
                    );
                  });
                })()}
              </div>
            )}

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea
                value={editEventDescription}
                onChange={(e) => setEditEventDescription(e.target.value)}
                rows={2}
                placeholder="Any additional notes…"
                className={`${inp} resize-none`}
              />
            </Field>

            {/* Status — hidden for Response to Notice (point-in-time action, no workflow state needed) */}
            {editEventCategory !== "response_to_notice" && (
              <Field label="Event Status">
                <select
                  value={editEventStatus}
                  onChange={(e) => setEditEventStatus(e.target.value)}
                  className={inp}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
            )}

            {editEventError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {editEventError}
              </div>
            )}

            <div className="border-t border-border -mx-6 px-6 pt-4">
              <EventAttachments
                eventId={editEvent.id}
                docs={editEvent.event_documents ?? []}
                canEdit={canEdit}
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setEditEvent(null)}
                className="px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editEventSaving}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {editEventSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Add Event Modal ── */}
      {addEventProcId && (
        <Modal
          title={addEventParentId ? "Add Sub Event" : "Add Main Event"}
          onClose={() => {
            setAddEventProcId(null);
            setAddEventParentId(null);
            setAddEventPendingFiles([]);
          }}
          isDirty={addEventIsDirty}
        >
          <form onSubmit={handleAddEvent} className="space-y-4">
            {/* Type badge (read-only) */}
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${addEventParentId ? "bg-purple-50 text-purple-700" : "bg-accent-light text-accent"}`}
              >
                {addEventParentId ? "Sub Event" : "Main Event"}
              </span>
            </div>

            {/* Inherited from parent main event (sub events only) */}
            {addEventParentId &&
              (() => {
                const parent = allEventsById[addEventParentId];
                if (!parent) return null;
                const parentDateField = PARENT_DATE_FIELD[parent.category];
                const parentDateKey = parentDateField?.key;
                const parentDateLabel = parentDateField?.label ?? "Date";
                const parentNoticeDate =
                  parentDateKey && parent.details?.[parentDateKey]
                    ? parent.details[parentDateKey]
                    : (parent.event_date ?? "");
                return (
                  <div className="rounded-lg bg-surface-hover border border-border px-4 py-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1.5">
                          Order No.
                        </label>
                        <input
                          readOnly
                          value={parent.event_notice_number ?? ""}
                          placeholder="—"
                          className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-surface-hover border-border text-muted cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1.5">
                          {parentDateLabel}
                        </label>
                        <input
                          readOnly
                          value={
                            parentNoticeDate
                              ? parentNoticeDate.slice(0, 10)
                              : ""
                          }
                          placeholder="—"
                          type="date"
                          className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-surface-hover border-border text-muted cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Category */}
            <Field label="Category *">
              <select
                value={eventCategory}
                onChange={(e) => handleEventCategoryChange(e.target.value)}
                className={inp}
              >
                <option value="">Select category…</option>
                {Object.entries(
                  addEventParentId ? SUB_EVENT_LABELS : MAIN_EVENT_LABELS,
                )
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>

            {/* Category Name — shown only when category is Others */}
            {(eventCategory === "others" || eventCategory === "others_sub") && (
              <Field label="Category Name *">
                <input
                  type="text"
                  value={eventDetails["category_name"] ?? ""}
                  onChange={(e) => setDetail("category_name", e.target.value)}
                  placeholder="Enter category name…"
                  className={inp}
                />
              </Field>
            )}

            {/* Order Number / Notice Number — main events only, not shown for Others */}
            {!addEventParentId && eventCategory !== "others" && (
              <Field
                label={NOTICE_NUMBER_FIELD_LABEL[eventCategory] ?? "Order Number"}
              >
                <input
                  type="text"
                  value={eventNoticeNumber}
                  onChange={(e) => setEventNoticeNumber(e.target.value)}
                  className={inp}
                />
              </Field>
            )}

            {/* Dynamic category fields */}
            {eventCategory && CATEGORY_FIELDS[eventCategory] && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-surface-hover">
                {(() => {
                  const addEffectiveCat =
                    addEventParentId !== null && eventCategory === "others"
                      ? "others_sub"
                      : eventCategory;
                  const addPrimaryKey = PRIMARY_DATE[addEffectiveCat];
                  return CATEGORY_FIELDS[eventCategory].map((field) => {
                    const isReq = field.key === addPrimaryKey;
                    const fieldErr = addEventFieldErrors[field.key];
                    const cls = isReq && fieldErr ? inpErr : inp;
                    return (
                      <Field
                        key={field.key}
                        label={field.label}
                        fullWidth={field.fullWidth}
                        required={isReq}
                        error={fieldErr}
                      >
                        {field.type === "datetime" && (
                          <DateTimeField
                            value={eventDetails[field.key] ?? ""}
                            onChange={(v) => setDetail(field.key, v)}
                          />
                        )}
                        {field.type === "date" && (
                          <input
                            type="date"
                            value={(eventDetails[field.key] ?? "").slice(0, 10)}
                            onChange={(e) =>
                              setDetail(field.key, e.target.value)
                            }
                            className={cls}
                          />
                        )}
                        {field.type === "text" && (
                          <input
                            type="text"
                            value={eventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setDetail(field.key, e.target.value)
                            }
                            className={cls}
                          />
                        )}
                        {field.type === "textarea" && (
                          <textarea
                            value={eventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setDetail(field.key, e.target.value)
                            }
                            rows={3}
                            className={`${cls} resize-none`}
                          />
                        )}
                        {field.type === "select" && (
                          <select
                            value={eventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setDetail(field.key, e.target.value)
                            }
                            className={cls}
                          >
                            <option value="">Select…</option>
                            {field.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {field.type === "proceeding_select" && (
                          <select
                            value={eventDetails[field.key] ?? ""}
                            onChange={(e) =>
                              setDetail(field.key, e.target.value)
                            }
                            className={cls}
                          >
                            <option value="">Select…</option>
                            {[...(mastersByType["proceeding_type"] ?? [])]
                              .filter(
                                (m) =>
                                  m.parent_id === appeal.act_regulation?.id,
                              )
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </Field>
                    );
                  });
                })()}
              </div>
            )}

            {/* Status — hidden for Response to Notice (point-in-time action, no workflow state needed) */}
            {eventCategory !== "response_to_notice" && (
              <Field label="Event Status">
                <select
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value)}
                  className={inp}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
            )}

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                rows={2}
                placeholder="Any additional notes…"
                className={`${inp} resize-none`}
              />
            </Field>

            {/* Attachments */}
            <PendingAttachments
              files={addEventPendingFiles}
              onChange={setAddEventPendingFiles}
            />

            {eventError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {eventError}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setAddEventProcId(null);
                  setAddEventParentId(null);
                  setAddEventPendingFiles([]);
                }}
                className="px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={eventSaving}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {eventSaving
                  ? "Adding…"
                  : addEventParentId
                    ? "Add Sub Event"
                    : "Add Main Event"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Confirm Delete Proceeding ── */}
      {confirmDeleteProc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">
              Delete Proceeding?
            </h3>
            <p className="text-sm text-secondary mb-1">
              This will permanently delete the proceeding and all its{" "}
              <strong>
                {confirmDeleteProc.events.length} event
                {confirmDeleteProc.events.length !== 1 ? "s" : ""}
              </strong>{" "}
              and documents.
            </p>
            <p className="text-xs text-red-600 font-medium mb-5">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteProc(null)}
                disabled={deletingProc}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProceeding}
                disabled={deletingProc}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {deletingProc ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Event ── */}
      {confirmDeleteEvent &&
        (() => {
          const subCount =
            confirmDeleteEvent.event_type === "main"
              ? (liveSubCountByParent[confirmDeleteEvent.id] ?? 0)
              : 0;
          return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
                <h3 className="text-base font-semibold text-heading mb-2">
                  Delete Event?
                </h3>
                <p className="text-sm text-secondary mb-3">
                  This will permanently delete the{" "}
                  <strong>
                    {EVENT_LABELS[confirmDeleteEvent.category] ??
                      confirmDeleteEvent.category}
                  </strong>{" "}
                  event and all its documents.
                </p>
                {subCount > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3">
                    <p className="text-sm font-semibold text-amber-800 mb-0.5">
                      This event has {subCount} sub-event
                      {subCount !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-amber-700">
                      All sub-events and their documents will also be
                      permanently deleted.
                    </p>
                  </div>
                )}
                <p className="text-xs text-red-600 font-medium mb-5">
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDeleteEvent(null)}
                    disabled={deletingEvent}
                    className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteEvent}
                    disabled={deletingEvent}
                    className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
                  >
                    {deletingEvent
                      ? "Deleting…"
                      : subCount > 0
                        ? `Delete Event & ${subCount} Sub-event${subCount !== 1 ? "s" : ""}`
                        : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Confirm Delete Appeal ── */}
      {confirmDeleteAppeal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">
              Delete Litigation?
            </h3>
            <p className="text-sm text-secondary mb-1">
              This will permanently delete this litigation along with all its
              proceedings and events.
            </p>
            <p className="text-sm font-medium text-red-600 mb-4">
              This action cannot be undone.
            </p>
            {deleteAppealError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {deleteAppealError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmDeleteAppeal(false);
                  setDeleteAppealError(null);
                }}
                disabled={deletingAppeal}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAppeal}
                disabled={deletingAppeal}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {deletingAppeal ? "Deleting…" : "Delete Litigation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
