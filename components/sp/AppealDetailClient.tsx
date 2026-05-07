"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  updateAppeal, updateProceeding, addProceeding, addEvent, updateEvent,
  deleteEvent, deleteAppeal, deleteProceeding,
  uploadProceedingDocument, deleteProceedingDocument,
  uploadEventDocument, deleteEventDocument,
  AppealInput, ProceedingInput, EventInput,
} from "@/app/(sp)/litigations/actions";

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
  category: string;
  event_date: string | null;
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
  assigned_to: string | null;
  client_staff_id: string | null;
  possible_outcome: string | null;
  status: string | null;
  is_active: boolean;
  created_at: string;
  assigned_user: { first_name: string; last_name: string } | null;
  client_staff: { first_name: string; last_name: string } | null;
  events: AppEvent[];
  proceeding_documents?: AttachedFile[];
}

interface Appeal {
  id: string;
  act_regulation: { id: string; name: string } | null;
  financial_year: { id: string; name: string } | null;
  assessment_year: { id: string; name: string } | null;
  status: string | null;
  client_org: { id: string; name: string } | null;
  proceedings: Proceeding[];
}

type MasterItem = { id: string; name: string; type: string; parent_id: string | null };

interface Props {
  appeal: Appeal;
  clients: { id: string; name: string }[];
  teamMembers: { id: string; first_name: string; last_name: string }[];
  clientUsers: { id: string; first_name: string; last_name: string }[];
  mastersByType: Record<string, MasterItem[]>;
  canEdit: boolean;
}

// ─── Event Category Field Config ─────────────────────────────────
type FieldType = "datetime" | "text" | "select" | "proceeding_select" | "file";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  fullWidth?: boolean;
}

const NOTICE_STATUS_OPTS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];
const YES_NO_OPTS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  notice_from_authority: [
    { key: "date_of_notice", label: "Date of Notice", type: "datetime" },
    { key: "notice_served_on", label: "Notice Served On", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
    { key: "personal_hearing_date", label: "Personal Hearing Date", type: "datetime" },
    { key: "target_date", label: "Target Date", type: "datetime" },
    { key: "notice_status", label: "Notice Status", type: "select", options: NOTICE_STATUS_OPTS, fullWidth: true },
  ],
  response_to_notice: [
    { key: "response_against_notice_dated", label: "Response Against Notice Dated", type: "datetime" },
    { key: "response_submitted_on", label: "Response Submitted On", type: "datetime" },
    { key: "revised_due_date", label: "Revised Due Date (if any)", type: "datetime" },
  ],
  adjournment_request: [
    { key: "against_notice_date", label: "Against Notice Date", type: "datetime" },
    { key: "adjourned_to", label: "Adjourned To", type: "datetime" },
  ],
  personal_hearing: [
    { key: "against_notice_dated", label: "Against Notice Dated", type: "datetime" },
    { key: "hearing_date", label: "Hearing Date", type: "datetime" },
    { key: "team_present", label: "Team Present", type: "text" },
    { key: "officers_present", label: "Officers Present", type: "text" },
  ],
  virtual_hearing: [
    { key: "against_notice_dated", label: "Against Notice Dated", type: "datetime" },
    { key: "hearing_date", label: "Hearing Date", type: "datetime" },
    { key: "team_present", label: "Team Present", type: "text" },
    { key: "officers_present", label: "Officers Present", type: "text" },
  ],
  personal_follow_up: [
    { key: "against_notice_dated", label: "Against Notice Dated", type: "datetime" },
    { key: "follow_up_with", label: "Follow Up With", type: "text" },
    { key: "follow_up_by", label: "Follow Up By", type: "text" },
  ],
  assessment_order: [
    { key: "date_of_order", label: "Date of Order", type: "datetime" },
    { key: "order_received_on", label: "Order Received On", type: "datetime" },
    { key: "order_received_by", label: "Order Received By", type: "text" },
    { key: "mode_of_receipt", label: "Mode of Receipt of Order", type: "text" },
    { key: "appeal_to_be_filed", label: "Appeal to be Filed", type: "select", options: YES_NO_OPTS },
    { key: "appeal_to_be_filed_by", label: "Appeal to be Filed By", type: "datetime" },
    { key: "appellate_authority", label: "Appellate Authority", type: "text" },
    { key: "appellate_authority_jurisdiction", label: "Appellate Authority Jurisdiction", type: "text" },
  ],
  notice_of_penalty: [
    { key: "date_of_notice", label: "Date of Notice", type: "datetime" },
    { key: "notice_served_on", label: "Notice Served On", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
    { key: "personal_hearing_date", label: "Personal Hearing Date", type: "datetime" },
    { key: "target_date", label: "Target Date", type: "datetime" },
    { key: "notice_status", label: "Notice Status", type: "select", options: NOTICE_STATUS_OPTS, fullWidth: true },
  ],
  penalty_order: [
    { key: "date_of_order", label: "Date of Order", type: "datetime" },
    { key: "order_received_on", label: "Order Received On", type: "datetime" },
    { key: "order_received_by", label: "Order Received By", type: "text" },
    { key: "mode_of_receipt", label: "Mode of Receipt of Order", type: "text" },
    { key: "appeal_to_be_filed", label: "Appeal to be Filed", type: "select", options: YES_NO_OPTS },
    { key: "appeal_to_be_filed_by", label: "Appeal to be Filed By", type: "datetime" },
    { key: "appellate_authority", label: "Appellate Authority", type: "text" },
    { key: "appellate_authority_jurisdiction", label: "Appellate Authority Jurisdiction", type: "text" },
  ],
  filing_of_appeal: [
    { key: "appeal_against_proceeding", label: "Appeal Against Proceeding", type: "proceeding_select", fullWidth: true },
    { key: "order_date", label: "Order Date", type: "datetime" },
    { key: "due_date_filing", label: "Due Date for Filing Appeal", type: "datetime" },
    { key: "target_date_filing", label: "Target Date for Filing Appeal", type: "datetime" },
    { key: "appeal_filed_on", label: "Appeal Filed On", type: "datetime" },
  ],
  others: [
    { key: "date", label: "Date", type: "datetime" },
  ],
};

// Primary date field per category (used as event_date for sorting)
const PRIMARY_DATE: Record<string, string> = {
  notice_from_authority: "date_of_notice",
  response_to_notice: "response_submitted_on",
  adjournment_request: "adjourned_to",
  personal_hearing: "hearing_date",
  virtual_hearing: "hearing_date",
  personal_follow_up: "against_notice_dated",
  assessment_order: "date_of_order",
  notice_of_penalty: "date_of_notice",
  penalty_order: "date_of_order",
  filing_of_appeal: "order_date",
  others: "date",
};

// ─── Other Constants ──────────────────────────────────────────────
const IMPORTANCE: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-red-100 text-red-700" },
  high: { label: "High", cls: "bg-orange-100 text-orange-700" },
  medium: { label: "Medium", cls: "bg-yellow-100 text-yellow-700" },
  low: { label: "Low", cls: "bg-green-100 text-green-700" },
};
const OUTCOME: Record<string, { label: string; cls: string }> = {
  favourable: { label: "Favourable", cls: "bg-green-100 text-green-700" },
  doubtful: { label: "Doubtful", cls: "bg-yellow-100 text-yellow-700" },
  unfavourable: { label: "Unfavourable", cls: "bg-red-100 text-red-700" },
};
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-blue-50 text-blue-700" },
  "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
};
const EVENT_LABELS: Record<string, string> = {
  notice_from_authority: "Notice from Authority",
  response_to_notice: "Response to Notice",
  adjournment_request: "Adjournment Request",
  personal_hearing: "Personal Hearing",
  virtual_hearing: "Virtual Hearing",
  personal_follow_up: "Personal Follow-up",
  assessment_order: "Assessment Order",
  notice_of_penalty: "Notice of Penalty",
  penalty_order: "Penalty Order",
  filing_of_appeal: "Filing of Appeal",
  others: "Others",
};
const NOTICE_STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", closed: "Closed",
};

// ─── Helpers ─────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const hasTime = d.includes("T");
  // Date-only strings (YYYY-MM-DD) are parsed as UTC by JS, causing off-by-one day
  // in non-UTC timezones. Appending T00:00 forces local-time parsing.
  const dt = new Date(hasTime ? d : d + "T00:00");
  const datePart = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (!hasTime) return datePart;
  return datePart + " " + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function getEventSummary(category: string, details: Record<string, string> | null): string {
  if (!details) return "";
  const parts: string[] = [];
  switch (category) {
    case "notice_from_authority":
    case "notice_of_penalty":
      if (details.date_of_notice) parts.push(`Notice: ${fmtDateTime(details.date_of_notice)}`);
      if (details.due_date) parts.push(`Due: ${fmtDateTime(details.due_date)}`);
      if (details.notice_status) parts.push(`Status: ${NOTICE_STATUS_LABEL[details.notice_status] ?? details.notice_status}`);
      break;
    case "response_to_notice":
      if (details.response_submitted_on) parts.push(`Submitted: ${fmtDateTime(details.response_submitted_on)}`);
      if (details.revised_due_date) parts.push(`Revised Due: ${fmtDateTime(details.revised_due_date)}`);
      break;
    case "adjournment_request":
      if (details.against_notice_date) parts.push(`Against Notice: ${fmtDateTime(details.against_notice_date)}`);
      if (details.adjourned_to) parts.push(`Adjourned To: ${fmtDateTime(details.adjourned_to)}`);
      break;
    case "personal_hearing":
    case "virtual_hearing":
      if (details.hearing_date) parts.push(`Hearing: ${fmtDateTime(details.hearing_date)}`);
      if (details.team_present) parts.push(`Team: ${details.team_present}`);
      if (details.officers_present) parts.push(`Officers: ${details.officers_present}`);
      break;
    case "personal_follow_up":
      if (details.follow_up_with) parts.push(`With: ${details.follow_up_with}`);
      if (details.follow_up_by) parts.push(`By: ${details.follow_up_by}`);
      break;
    case "assessment_order":
    case "penalty_order":
      if (details.date_of_order) parts.push(`Order: ${fmtDateTime(details.date_of_order)}`);
      if (details.order_received_by) parts.push(`Received by: ${details.order_received_by}`);
      if (details.appeal_to_be_filed) parts.push(`Appeal: ${details.appeal_to_be_filed === "yes" ? "Yes" : "No"}`);
      if (details.appeal_to_be_filed === "yes" && details.appeal_to_be_filed_by)
        parts.push(`File by: ${fmtDateTime(details.appeal_to_be_filed_by)}`);
      break;
  }
  return parts.join("  ·  ");
}

const inp = "w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

function Field({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-[#6B7280] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
// Splits a combined datetime string into separate date+time inputs so the
// time portion never auto-fills with the current time (browser datetime-local quirk).
function DateTimeField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const datePart = value ? value.slice(0, 10) : "";          // "YYYY-MM-DD"
  const timePart = value && value.includes("T") ? value.slice(11, 16) : ""; // "HH:MM"

  function handleDateChange(newDate: string) {
    if (!newDate) { onChange(""); return; }
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
        className="px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] w-32 flex-shrink-0"
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[#9CA3AF] mb-0.5">{label}</p>
      <p className="text-sm text-[#1A1A2E]">{value || "—"}</p>
    </div>
  );
}

// ─── Attachment Panels ────────────────────────────────────────────
function AttachmentRow({ doc, onDelete, canEdit }: { doc: AttachedFile; onDelete: () => void; canEdit: boolean }) {
  return (
    <div className="px-4 py-2.5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#1A1A2E] truncate">{doc.file_name}</span>
            {doc.file_size && <span className="text-xs text-[#9CA3AF] flex-shrink-0">{(doc.file_size / 1024).toFixed(0)} KB</span>}
          </div>
          {doc.description && <p className="text-xs text-[#6B7280] mt-0.5">{doc.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="View file"
          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        </a>
        <a href={doc.file_url} download={doc.file_name} title="Download file"
          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </a>
        {canEdit && (
          <button onClick={onDelete} title="Delete file" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ProceedingAttachments({ proceedingId, docs, canEdit }: {
  proceedingId: string;
  docs: AttachedFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingFiles, setPendingFiles] = useState<{ file: File; desc: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AttachedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activeDocs = docs.filter((d) => !d.deleted_at);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files.map((f) => ({ file: f, desc: "" }))]);
    e.target.value = "";
  }

  function updateDesc(idx: number, desc: string) {
    setPendingFiles((prev) => prev.map((p, i) => i === idx ? { ...p, desc } : p));
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadAll() {
    if (!pendingFiles.length) return;
    setUploading(true); setError(null);
    const supabase = createClient();
    try {
      for (const { file, desc } of pendingFiles) {
        const path = `proceeding-docs/${proceedingId}/${Date.now()}-${file.name}`;
        const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
        if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
        await uploadProceedingDocument(proceedingId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
      }
      setPendingFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attachment.");
    } finally { setUploading(false); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteProceedingDocument(confirmDelete.id);
      setConfirmDelete(null);
      router.refresh();
    } catch { /* swallow */ } finally { setDeleting(false); }
  }

  return (
    <div className="px-5 pb-4 pt-1">
      <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 bg-[#F8F9FA] flex items-center justify-between border-b border-[#E5E7EB]">
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Attachments ({activeDocs.length})</span>
          {canEdit && (
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#E5E7EB] bg-white rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Choose Files
              <input type="file" multiple className="hidden" onChange={handleFileSelect} />
            </label>
          )}
        </div>

        {/* Existing files */}
        {activeDocs.length === 0 && pendingFiles.length === 0 ? (
          <div className="px-4 py-3 text-center text-xs text-[#9CA3AF]">
            No attachments.{canEdit ? " Use Choose Files to add files." : ""}
          </div>
        ) : activeDocs.length > 0 ? (
          <div className="divide-y divide-[#F3F4F6]">
            {activeDocs.map((doc) => (
              <AttachmentRow key={doc.id} doc={doc} canEdit={canEdit} onDelete={() => setConfirmDelete(doc)} />
            ))}
          </div>
        ) : null}

        {/* Pending files with description inputs */}
        {pendingFiles.length > 0 && (
          <div className="border-t border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3 space-y-3">
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">{error}</div>}
            {pendingFiles.map(({ file, desc }, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs text-[#1A1A2E] font-medium truncate w-32 flex-shrink-0">{file.name}</span>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={desc}
                  onChange={(e) => updateDesc(idx, e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] bg-white"
                />
                <button type="button" onClick={() => removePending(idx)}
                  className="p-1 text-[#9CA3AF] hover:text-red-500 transition flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={handleUploadAll} disabled={uploading}
                className="px-3 py-1 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium disabled:opacity-50">
                {uploading ? "Uploading…" : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
              </button>
              <button onClick={() => { setPendingFiles([]); setError(null); }}
                className="px-3 py-1 text-xs border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-white">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Attachment?</h3>
            <p className="text-sm text-[#6B7280] mb-5">Delete <strong>"{confirmDelete.file_name}"</strong>? This will move it to trash.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventAttachments({ eventId, docs, canEdit }: {
  eventId: string;
  docs: AttachedFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingFiles, setPendingFiles] = useState<{ file: File; desc: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AttachedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activeDocs = docs.filter((d) => !d.deleted_at);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files.map((f) => ({ file: f, desc: "" }))]);
    e.target.value = "";
  }

  function updateDesc(idx: number, desc: string) {
    setPendingFiles((prev) => prev.map((p, i) => i === idx ? { ...p, desc } : p));
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadAll() {
    if (!pendingFiles.length) return;
    setUploading(true); setError(null);
    const supabase = createClient();
    try {
      for (const { file, desc } of pendingFiles) {
        const path = `event-docs/${eventId}/${Date.now()}-${file.name}`;
        const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
        if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
        await uploadEventDocument(eventId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
      }
      setPendingFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attachment.");
    } finally { setUploading(false); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteEventDocument(confirmDelete.id);
      setConfirmDelete(null);
      router.refresh();
    } catch { /* swallow */ } finally { setDeleting(false); }
  }

  return (
    <div className="mt-2">
      <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-3 py-1.5 bg-[#F8F9FA] flex items-center justify-between border-b border-[#E5E7EB]">
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Files ({activeDocs.length})</span>
          {canEdit && (
            <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-[#E5E7EB] bg-white rounded text-[#6B7280] hover:bg-[#F8F9FA] transition">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Choose Files
              <input type="file" multiple className="hidden" onChange={handleFileSelect} />
            </label>
          )}
        </div>

        {/* Existing files */}
        {activeDocs.length === 0 && pendingFiles.length === 0 ? (
          <div className="px-3 py-2 text-center text-xs text-[#9CA3AF]">No files attached.</div>
        ) : activeDocs.length > 0 ? (
          <div className="divide-y divide-[#F3F4F6]">
            {activeDocs.map((doc) => (
              <AttachmentRow key={doc.id} doc={doc} canEdit={canEdit} onDelete={() => setConfirmDelete(doc)} />
            ))}
          </div>
        ) : null}

        {/* Pending files with description inputs */}
        {pendingFiles.length > 0 && (
          <div className="border-t border-[#E5E7EB] bg-[#F8F9FA] px-3 py-2.5 space-y-2.5">
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1">{error}</div>}
            {pendingFiles.map(({ file, desc }, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs text-[#1A1A2E] font-medium truncate w-28 flex-shrink-0">{file.name}</span>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={desc}
                  onChange={(e) => updateDesc(idx, e.target.value)}
                  className="flex-1 px-2 py-0.5 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] bg-white"
                />
                <button type="button" onClick={() => removePending(idx)}
                  className="p-0.5 text-[#9CA3AF] hover:text-red-500 transition flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-0.5">
              <button onClick={handleUploadAll} disabled={uploading}
                className="px-2.5 py-1 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium disabled:opacity-50">
                {uploading ? "Uploading…" : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
              </button>
              <button onClick={() => { setPendingFiles([]); setError(null); }}
                className="px-2.5 py-1 text-xs border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-white">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete File?</h3>
            <p className="text-sm text-[#6B7280] mb-5">Delete <strong>"{confirmDelete.file_name}"</strong>? This will move it to trash.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Proceeding Form Fields ────────────────────────────────────────
function ProceedingFormFields({
  values, onChange, mastersByType, teamMembers, clientUsers, actRegulationId,
}: {
  values: ProceedingInput;
  onChange: (field: keyof ProceedingInput, value: string) => void;
  mastersByType: Record<string, MasterItem[]>;
  teamMembers: { id: string; first_name: string; last_name: string }[];
  clientUsers: { id: string; first_name: string; last_name: string }[];
  actRegulationId?: string;
}) {
  const allProcs = mastersByType["proceeding_type"] ?? [];
  const availableProcs = actRegulationId
    ? allProcs.filter(m => m.parent_id === actRegulationId)
    : allProcs;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Proceeding">
        <select value={values.proceeding_type_id ?? ""} onChange={(e) => onChange("proceeding_type_id", e.target.value)} className={inp}>
          <option value="">Select…</option>
          {[...availableProcs].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Authority Type">
        <input value={values.authority_type ?? ""} onChange={(e) => onChange("authority_type", e.target.value)} className={inp} />
      </Field>
      <Field label="Authority Name">
        <input value={values.authority_name ?? ""} onChange={(e) => onChange("authority_name", e.target.value)} placeholder="e.g. ACIT, Circle 1(1)" className={inp} />
      </Field>
      <Field label="Jurisdiction City">
        <input value={values.jurisdiction_city ?? ""} onChange={(e) => onChange("jurisdiction_city", e.target.value)} placeholder="e.g. Chennai" className={inp} />
      </Field>
      <Field label="Jurisdiction / Address" fullWidth>
        <input value={values.jurisdiction ?? ""} onChange={(e) => onChange("jurisdiction", e.target.value)} placeholder="Full jurisdiction or address" className={inp} />
      </Field>
      <Field label="Importance">
        <select value={values.importance ?? ""} onChange={(e) => onChange("importance", e.target.value)} className={inp}>
          <option value="">Select…</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Field>
      <Field label="Mode">
        <select value={values.mode ?? ""} onChange={(e) => onChange("mode", e.target.value)} className={inp}>
          <option value="">Select…</option>
          <option value="online">Online</option>
          <option value="offline">Offline / Physical</option>
        </select>
      </Field>
      <Field label="Initiated On">
        <input type="date" value={values.initiated_on ?? ""} onChange={(e) => onChange("initiated_on", e.target.value)} className={inp} />
      </Field>
      <Field label="To Be Completed By">
        <input type="date" value={values.to_be_completed_by ?? ""} onChange={(e) => onChange("to_be_completed_by", e.target.value)} className={inp} />
      </Field>
      <Field label="Assigned To">
        <select value={values.assigned_to ?? ""} onChange={(e) => onChange("assigned_to", e.target.value)} className={inp}>
          <option value="">Unassigned</option>
          {[...teamMembers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
        </select>
      </Field>
      <Field label="Client Staff">
        <select value={values.client_staff_id ?? ""} onChange={(e) => onChange("client_staff_id", e.target.value)} className={inp}>
          <option value="">None</option>
          {[...clientUsers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
        </select>
      </Field>
      <Field label="Possible Outcome">
        <select value={values.possible_outcome ?? ""} onChange={(e) => onChange("possible_outcome", e.target.value)} className={inp}>
          <option value="">Select…</option>
          <option value="favourable">Favourable</option>
          <option value="doubtful">Doubtful</option>
          <option value="unfavourable">Unfavourable</option>
        </select>
      </Field>
      <Field label="Status">
        <select value={values.status ?? "open"} onChange={(e) => onChange("status", e.target.value)} className={inp}>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
      </Field>
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-[#1A1A2E]">{title}</h3>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function AppealDetailClient({ appeal, clients, teamMembers, clientUsers, mastersByType, canEdit }: Props) {
  const router = useRouter();
  const clientOrg = appeal.client_org ?? null;

  // ── Edit Appeal ──
  const [showEditAppeal, setShowEditAppeal] = useState(false);
  const [editClientId, setEditClientId] = useState(clientOrg?.id ?? "");
  const [editFY, setEditFY] = useState(appeal.financial_year?.id ?? "");
  const [editAY, setEditAY] = useState(appeal.assessment_year?.id ?? "");
  const [editAct, setEditAct] = useState(appeal.act_regulation?.id ?? "");
  const [editAppealStatus, setEditAppealStatus] = useState(appeal.status ?? "open");
  const [appealSaving, setAppealSaving] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  // Derive AY state for edit modal
  const editActObj = (mastersByType["act_regulation"] ?? []).find(m => m.id === editAct);
  const editIsITAct = editActObj?.name === "The Income-tax Act, 1961";
  const editFYObj = (mastersByType["financial_year"] ?? []).find(m => m.id === editFY);
  const editFYName = editFYObj?.name ?? "";
  const editAYDisabled = !editIsITAct || (editFYName ? isAYDisabled(editFYName) : false);
  const editAYName = editAYDisabled ? "Not applicable"
    : ((mastersByType["assessment_year"] ?? []).find(m => m.id === editAY)?.name ?? "—");

  function handleEditFYChange(fyId: string) {
    setEditFY(fyId);
    if (!fyId || !editIsITAct) { setEditAY(""); return; }
    const fy = (mastersByType["financial_year"] ?? []).find(m => m.id === fyId);
    if (!fy || isAYDisabled(fy.name)) { setEditAY(""); return; }
    const derivedName = deriveAYName(fy.name);
    const ayItem = (mastersByType["assessment_year"] ?? []).find(m => m.name === derivedName);
    setEditAY(ayItem?.id ?? "");
  }

  async function handleSaveAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!editClientId) { setAppealError("Client is required."); return; }
    setAppealSaving(true); setAppealError(null);
    try {
      await updateAppeal(appeal.id, { client_org_id: editClientId, financial_year_id: editFY, assessment_year_id: editAY, act_regulation_id: editAct, status: editAppealStatus });
      setShowEditAppeal(false);
      router.refresh();
    } catch (err) {
      setAppealError(err instanceof Error ? err.message : "Failed to save.");
    } finally { setAppealSaving(false); }
  }

  // ── Edit Proceeding ──
  const [editProc, setEditProc] = useState<Proceeding | null>(null);
  const [editProcValues, setEditProcValues] = useState<ProceedingInput>({});
  const [editProcSaving, setEditProcSaving] = useState(false);
  const [editProcError, setEditProcError] = useState<string | null>(null);

  function openEditProc(proc: Proceeding) {
    setEditProc(proc);
    setEditProcValues({
      proceeding_type_id: proc.proceeding_type?.id ?? "",
      authority_type: proc.authority_type ?? "",
      authority_name: proc.authority_name ?? "",
      jurisdiction: proc.jurisdiction ?? "",
      jurisdiction_city: proc.jurisdiction_city ?? "",
      importance: proc.importance ?? "",
      mode: proc.mode ?? "",
      initiated_on: proc.initiated_on ?? "",
      to_be_completed_by: proc.to_be_completed_by ?? "",
      assigned_to: proc.assigned_to ?? "",
      client_staff_id: proc.client_staff_id ?? "",
      possible_outcome: proc.possible_outcome ?? "",
      status: proc.status ?? "open",
    });
    setEditProcError(null);
  }

  async function handleSaveProc(e: React.FormEvent) {
    e.preventDefault();
    if (!editProc) return;
    setEditProcSaving(true); setEditProcError(null);
    try {
      await updateProceeding(editProc.id, editProcValues);
      setEditProc(null); router.refresh();
    } catch (err) {
      setEditProcError(err instanceof Error ? err.message : "Failed to save.");
    } finally { setEditProcSaving(false); }
  }

  // ── Add Proceeding ──
  const [showAddProc, setShowAddProc] = useState(false);
  const [addProcValues, setAddProcValues] = useState<ProceedingInput>({});
  const [addProcSaving, setAddProcSaving] = useState(false);
  const [addProcError, setAddProcError] = useState<string | null>(null);

  const [addProcPendingFiles, setAddProcPendingFiles] = useState<{ file: File; desc: string }[]>([]);

  function addProcFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setAddProcPendingFiles((prev) => [...prev, ...files.map((f) => ({ file: f, desc: "" }))]);
    e.target.value = "";
  }

  async function handleAddProc(e: React.FormEvent) {
    e.preventDefault();
    setAddProcSaving(true); setAddProcError(null);
    try {
      const procId = await addProceeding(appeal.id, addProcValues);
      if (addProcPendingFiles.length > 0) {
        const supabase = createClient();
        for (const { file, desc } of addProcPendingFiles) {
          const path = `proceeding-docs/${procId}/${Date.now()}-${file.name}`;
          const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
          if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
          const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
          await uploadProceedingDocument(procId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        }
      }
      setShowAddProc(false); setAddProcValues({}); setAddProcPendingFiles([]); router.refresh();
    } catch (err) {
      setAddProcError(err instanceof Error ? err.message : "Failed to add proceeding.");
    } finally { setAddProcSaving(false); }
  }

  // ── Add Event ──
  const [addEventProcId, setAddEventProcId] = useState<string | null>(null);
  const [eventCategory, setEventCategory] = useState("");
  const [eventDetails, setEventDetails] = useState<Record<string, string>>({});
  const [eventDescription, setEventDescription] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [addEventPendingFiles, setAddEventPendingFiles] = useState<{ file: File; desc: string }[]>([]);

  function addEventFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setAddEventPendingFiles((prev) => [...prev, ...files.map((f) => ({ file: f, desc: "" }))]);
    e.target.value = "";
  }

  // ── View Event ──
  const [viewEvent, setViewEvent] = useState<AppEvent | null>(null);

  // ── Edit Event ──
  const [editEvent, setEditEvent] = useState<AppEvent | null>(null);
  const [editEventCategory, setEditEventCategory] = useState("");
  const [editEventDetails, setEditEventDetails] = useState<Record<string, string>>({});
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventSaving, setEditEventSaving] = useState(false);
  const [editEventError, setEditEventError] = useState<string | null>(null);

  function openEditEvent(ev: AppEvent) {
    setEditEvent(ev);
    setEditEventCategory(ev.category);
    setEditEventDetails(ev.details ? { ...ev.details } : {});
    setEditEventDescription(ev.description ?? "");
    setEditEventError(null);
  }

  function setEditDetail(key: string, value: string) {
    setEditEventDetails((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editEvent || !editEventCategory) { setEditEventError("Category is required."); return; }
    setEditEventSaving(true); setEditEventError(null);
    try {
      await updateEvent(editEvent.id, {
        proceeding_id: "", // not used in update
        category: editEventCategory,
        description: editEventDescription || undefined,
        details: editEventDetails,
      });
      setEditEvent(null);
      router.refresh();
    } catch (err) {
      setEditEventError(err instanceof Error ? err.message : "Failed to save event.");
    } finally { setEditEventSaving(false); }
  }

  // ── Delete Event ──
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<AppEvent | null>(null);
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
    } finally { setDeletingEvent(false); }
  }

  // ── Delete Proceeding ──
  const [confirmDeleteProc, setConfirmDeleteProc] = useState<Proceeding | null>(null);
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
    } finally { setDeletingProc(false); }
  }

  // ── Delete Appeal ──
  const [confirmDeleteAppeal, setConfirmDeleteAppeal] = useState(false);
  const [deletingAppeal, setDeletingAppeal] = useState(false);
  const [deleteAppealError, setDeleteAppealError] = useState<string | null>(null);

  async function handleDeleteAppeal() {
    setDeletingAppeal(true);
    setDeleteAppealError(null);
    try {
      await deleteAppeal(appeal.id);
      window.location.href = "/litigations";
    } catch (err) {
      setDeleteAppealError(err instanceof Error ? err.message : "Failed to delete litigation.");
      setDeletingAppeal(false);
    }
  }

  function openAddEvent(procId: string) {
    setAddEventProcId(procId);
    setEventCategory(""); setEventDetails({}); setEventDescription(""); setEventError(null);
  }

  function handleEventCategoryChange(cat: string) {
    setEventCategory(cat);
    setEventDetails({}); // Reset all fields when category changes
  }

  function setDetail(key: string, value: string) {
    setEventDetails((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!addEventProcId || !eventCategory) { setEventError("Category is required."); return; }
    setEventSaving(true); setEventError(null);
    try {
      const primaryKey = PRIMARY_DATE[eventCategory];
      const primaryDate = primaryKey && eventDetails[primaryKey]
        ? new Date(eventDetails[primaryKey]).toISOString()
        : undefined;

      const input: EventInput = {
        proceeding_id: addEventProcId,
        category: eventCategory,
        event_date: primaryDate,
        description: eventDescription || undefined,
        details: eventDetails,
      };
      const eventId = await addEvent(input);
      if (addEventPendingFiles.length > 0) {
        const supabase = createClient();
        for (const { file, desc } of addEventPendingFiles) {
          const path = `event-docs/${eventId}/${Date.now()}-${file.name}`;
          const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
          if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
          const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
          await uploadEventDocument(eventId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        }
      }
      setAddEventProcId(null); setAddEventPendingFiles([]);
      router.refresh();
    } catch (err) {
      setEventError(err instanceof Error ? err.message : "Failed to add event.");
    } finally { setEventSaving(false); }
  }

  const proceedingFormChange = (setter: React.Dispatch<React.SetStateAction<ProceedingInput>>) =>
    (field: keyof ProceedingInput, value: string) => setter((prev) => ({ ...prev, [field]: value }));

  const sortedProceedings = [...(appeal.proceedings ?? [])]
    .filter((p) => !(p as any).deleted_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Track which proceedings are expanded (collapsed by default)
  const [expandedProcs, setExpandedProcs] = useState<Set<string>>(new Set());
  function toggleProc(id: string) {
    setExpandedProcs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Track which events are expanded (collapsed by default)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  function toggleEvent(id: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Render ──
  return (
    <div className="space-y-4 max-w-4xl">

      {/* Appeal Header */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm flex items-start justify-between gap-4">
        <div className="grid grid-cols-5 gap-6 flex-1">
          <DetailRow label="Client" value={<span className="font-medium">{clientOrg?.name}</span>} />
          <DetailRow label="Financial Year" value={appeal.financial_year?.name} />
          <DetailRow label="Assessment Year" value={appeal.assessment_year?.name} />
          <DetailRow label="Act / Regulation" value={appeal.act_regulation?.name} />
          <DetailRow label="Status" value={(() => { const s = STATUS_CFG[appeal.status ?? "open"]; return s ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span> : null; })()} />
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setEditClientId(clientOrg?.id ?? ""); setEditFY(appeal.financial_year?.id ?? ""); setEditAY(appeal.assessment_year?.id ?? ""); setEditAct(appeal.act_regulation?.id ?? ""); setEditAppealStatus(appeal.status ?? "open"); setAppealError(null); setShowEditAppeal(true); }}
              className="px-3 py-1.5 text-xs cursor-pointer border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
            >
              Edit Litigation
            </button>
            <button
              onClick={() => setConfirmDeleteAppeal(true)}
              className="px-3 py-1.5 text-xs cursor-pointer border border-red-200 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition"
            >
              Delete Litigation
            </button>
          </div>
        )}
      </div>

      {/* Proceedings */}
      {sortedProceedings.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-8 text-center text-[#6B7280] text-sm">No proceedings yet.</div>
      ) : (
        <div className="space-y-3">
          {sortedProceedings.map((proc, idx) => {
            const impCfg = proc.importance ? IMPORTANCE[proc.importance] : null;
            const outCfg = proc.possible_outcome ? OUTCOME[proc.possible_outcome] : null;
            const au = proc.assigned_user ?? null;
            const cs = proc.client_staff ?? null;
            const sortedEvents = [...(proc.events ?? [])]
              .filter((e) => !e.deleted_at)
              .sort((a, b) => (b.event_date ?? b.created_at).localeCompare(a.event_date ?? a.created_at));
            const procStatusCfg = STATUS_CFG[proc.status ?? "open"];
            const isExpanded = expandedProcs.has(proc.id);

            return (
              <div key={proc.id} className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">

                {/* ── Collapsed summary row (always visible) ── */}
                <div
                  className="px-5 py-3.5 flex items-center gap-3 cursor-pointer bg-[#EEF2FF] hover:bg-[#E4EBFA] transition-colors select-none"
                  onClick={() => toggleProc(proc.id)}
                >
                  {/* Chevron */}
                  <svg
                    className={`w-4 h-4 flex-shrink-0 text-[#9CA3AF] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Number */}
                  <span className="text-xs text-[#9CA3AF] font-medium bg-[#F3F4F6] px-2 py-0.5 rounded flex-shrink-0">
                    #{idx + 1}
                  </span>

                  {/* Forum / type */}
                  <span className="font-semibold text-[#1A1A2E] text-sm truncate">
                    {proc.proceeding_type?.name ?? "—"}
                  </span>

                  {/* Authority */}
                  {proc.authority_name && (
                    <span className="text-xs text-[#6B7280] truncate hidden sm:block">
                      {[proc.authority_type, proc.authority_name].filter(Boolean).join(" · ")}
                    </span>
                  )}

                  {/* Badges */}
                  <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                    {impCfg && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${impCfg.cls}`}>{impCfg.label}</span>}
                    {proc.mode && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#F3F4F6] text-[#6B7280] capitalize hidden md:inline-flex">{proc.mode}</span>}
                    {procStatusCfg && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${procStatusCfg.cls}`}>{procStatusCfg.label}</span>}
                    <span className="text-xs text-[#9CA3AF]">{sortedEvents.length} event{sortedEvents.length !== 1 ? "s" : ""}</span>
                    {au && <span className="text-xs text-[#6B7280] hidden lg:block">{au.first_name} {au.last_name}</span>}
                    {proc.to_be_completed_by && (
                      <span className="text-xs text-[#6B7280] hidden lg:block">Due {fmtDate(proc.to_be_completed_by)}</span>
                    )}
                  </div>
                </div>

                {/* ── Expanded content ── */}
                {isExpanded && (
                  <div className="border-t border-[#E5E7EB]">
                    {/* Proceeding details */}
                    <div className="px-5 py-4 grid grid-cols-3 gap-x-6 gap-y-4 border-b border-[#D1D9E6] bg-[#EBF1F9]">
                      <DetailRow label="Authority" value={[proc.authority_type, proc.authority_name].filter(Boolean).join(" · ")} />
                      <DetailRow label="Jurisdiction" value={[proc.jurisdiction_city, proc.jurisdiction].filter(Boolean).join(", ")} />
                      <DetailRow label="Assigned To" value={au ? `${au.first_name} ${au.last_name}` : null} />
                      <DetailRow label="Client Staff" value={cs ? `${cs.first_name} ${cs.last_name}` : null} />
                      <DetailRow label="Initiated On" value={fmtDate(proc.initiated_on)} />
                      <DetailRow label="Deadline" value={fmtDate(proc.to_be_completed_by)} />
                      <DetailRow label="Possible Outcome" value={outCfg ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outCfg.cls}`}>{outCfg.label}</span>
                      ) : null} />
                      {canEdit && (
                        <div className="col-span-3 flex justify-end gap-2 pt-1">
                          <button onClick={(e) => { e.stopPropagation(); openEditProc(proc); }}
                            className="px-3 py-1.5 text-xs border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:text-[#1A1A2E] hover:bg-white transition">
                            Edit Proceeding
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteProc(proc); }}
                            className="px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition">
                            Delete Proceeding
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Proceeding Attachments */}
                    <ProceedingAttachments
                      proceedingId={proc.id}
                      docs={proc.proceeding_documents ?? []}
                      canEdit={canEdit}
                    />

                    {/* Events */}
                    <div className="px-5 py-4 bg-[#EBF1F9]">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Events ({sortedEvents.length})</p>
                        {canEdit && (
                          <button onClick={(e) => { e.stopPropagation(); openAddEvent(proc.id); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg transition">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Event
                          </button>
                        )}
                      </div>
                      {sortedEvents.length === 0 ? (
                        <p className="text-xs text-[#9CA3AF]">No events recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {sortedEvents.map((ev, evIdx) => {
                            const summary = getEventSummary(ev.category, ev.details);
                            const attachmentUrl = ev.details?.attachment;
                            const isEvExpanded = expandedEvents.has(ev.id);
                            // Derive primary date for collapsed row display
                            const primaryKey = PRIMARY_DATE[ev.category];
                            const primaryDate = primaryKey && ev.details?.[primaryKey]
                              ? fmtDateTime(ev.details[primaryKey])
                              : ev.event_date ? fmtDateTime(ev.event_date) : null;

                            return (
                              <div key={ev.id} className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white">
                                {/* Collapsed summary row */}
                                <div
                                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-[#F8F9FA] transition-colors select-none"
                                  onClick={() => toggleEvent(ev.id)}
                                >
                                  {/* Chevron */}
                                  <svg
                                    className={`w-3.5 h-3.5 flex-shrink-0 text-[#9CA3AF] transition-transform duration-200 ${isEvExpanded ? "rotate-90" : ""}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>

                                  {/* Category badge */}
                                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-[#4A6FA5] whitespace-nowrap flex-shrink-0">
                                    {EVENT_LABELS[ev.category] ?? ev.category}
                                  </span>

                                  {/* Primary date */}
                                  {primaryDate && (
                                    <span className="text-xs text-[#6B7280] truncate hidden sm:block">{primaryDate}</span>
                                  )}

                                  {/* Attachment indicator */}
                                  {attachmentUrl && (
                                    <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                  )}

                                  {/* Summary (truncated) */}
                                  {summary && !primaryDate && (
                                    <span className="text-xs text-[#9CA3AF] truncate flex-1 hidden md:block">{summary}</span>
                                  )}

                                  {/* Actions */}
                                  <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setViewEvent(ev); }}
                                      title="Quick view event"
                                      className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    </button>
                                    {canEdit && (
                                      <>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openEditEvent(ev); }}
                                          title="Edit event"
                                          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteEvent(ev); }}
                                          title="Delete event"
                                          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Expanded details */}
                                {isEvExpanded && (
                                  <div className="border-t border-[#D1D9E6] bg-[#EBF1F9] px-4 py-3">
                                    {summary && <p className="text-xs text-[#6B7280] mb-1.5">{summary}</p>}
                                    {ev.description && <p className="text-xs text-[#9CA3AF] italic mb-1.5">{ev.description}</p>}
                                    {attachmentUrl && (
                                      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-[#4A6FA5] hover:underline mb-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                        View Attachment
                                      </a>
                                    )}
                                    <EventAttachments
                                      eventId={ev.id}
                                      docs={ev.event_documents ?? []}
                                      canEdit={canEdit}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Proceeding */}
      {canEdit && (
        <button onClick={() => { setAddProcValues({}); setAddProcError(null); setShowAddProc(true); }}
          className="w-full py-3 cursor-pointer border-2 border-dashed border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] hover:border-[#1E3A5F] hover:text-[#1E3A5F] transition flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Proceeding
        </button>
      )}

      {/* ── Edit Appeal Modal ── */}
      {showEditAppeal && (
        <Modal title="Edit Litigation" onClose={() => setShowEditAppeal(false)}>
          <form onSubmit={handleSaveAppeal} className="space-y-4">
            <Field label="Client Organisation">
              <select value={editClientId} onChange={(e) => setEditClientId(e.target.value)} className={inp}>
                <option value="">Select client…</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Act / Regulation" fullWidth>
                <select value={editAct} onChange={(e) => setEditAct(e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {[...(mastersByType["act_regulation"] ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Financial Year / Tax Year">
                <select value={editFY} onChange={(e) => handleEditFYChange(e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {[...(mastersByType["financial_year"] ?? [])].sort((a, b) => b.name.localeCompare(a.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Assessment Year">
                <div className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280] cursor-not-allowed">
                  {editAYName}
                </div>
              </Field>
              <Field label="Status">
                <select value={editAppealStatus} onChange={(e) => setEditAppealStatus(e.target.value)} className={inp}>
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
            </div>
            {appealError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{appealError}</div>}
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowEditAppeal(false)} className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button type="submit" disabled={appealSaving} className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                {appealSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Proceeding Modal ── */}
      {editProc && (
        <Modal title="Edit Proceeding" onClose={() => setEditProc(null)}>
          <form onSubmit={handleSaveProc} className="space-y-4">
            <ProceedingFormFields values={editProcValues} onChange={proceedingFormChange(setEditProcValues)} mastersByType={mastersByType} teamMembers={teamMembers} clientUsers={clientUsers} actRegulationId={appeal.act_regulation?.id ?? undefined} />
            {editProcError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{editProcError}</div>}
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setEditProc(null)} className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button type="submit" disabled={editProcSaving} className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                {editProcSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Add Proceeding Modal ── */}
      {showAddProc && (
        <Modal title="Add Proceeding" onClose={() => { setShowAddProc(false); setAddProcPendingFiles([]); }}>
          <form onSubmit={handleAddProc} className="space-y-4">
            <ProceedingFormFields values={addProcValues} onChange={proceedingFormChange(setAddProcValues)} mastersByType={mastersByType} teamMembers={teamMembers} clientUsers={clientUsers} actRegulationId={appeal.act_regulation?.id ?? undefined} />
            {/* Attachments */}
            <div className="border-t border-[#F3F4F6] pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#6B7280]">Attachments (optional)</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Choose Files
                  <input type="file" multiple className="hidden" onChange={addProcFileSelect} />
                </label>
              </div>
              {addProcPendingFiles.map(({ file, desc }, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="text-xs text-[#1A1A2E] truncate w-32 flex-shrink-0">{file.name}</span>
                  <input type="text" placeholder="Description (optional)" value={desc}
                    onChange={(e) => setAddProcPendingFiles((prev) => prev.map((p, i) => i === idx ? { ...p, desc: e.target.value } : p))}
                    className="flex-1 px-2.5 py-1 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]" />
                  <button type="button" onClick={() => setAddProcPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-[#9CA3AF] hover:text-red-500 transition flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            {addProcError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{addProcError}</div>}
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => { setShowAddProc(false); setAddProcPendingFiles([]); }} className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button type="submit" disabled={addProcSaving} className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                {addProcSaving ? "Adding…" : "Add Proceeding"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Quick View Event Modal ── */}
      {viewEvent && (
        <Modal title={EVENT_LABELS[viewEvent.category] ?? viewEvent.category} onClose={() => setViewEvent(null)}>
          <div className="space-y-5">
            {/* Category-specific fields */}
            {CATEGORY_FIELDS[viewEvent.category] && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {CATEGORY_FIELDS[viewEvent.category].map((field) => {
                  const rawVal = viewEvent.details?.[field.key];
                  let display: React.ReactNode = <span className="text-[#9CA3AF]">—</span>;
                  if (rawVal) {
                    if (field.type === "datetime") {
                      display = fmtDateTime(rawVal);
                    } else if (field.type === "select") {
                      const opt = field.options?.find((o) => o.value === rawVal);
                      display = opt?.label ?? rawVal;
                    } else if (field.type === "proceeding_select") {
                      const proc = (mastersByType["proceeding_type"] ?? []).find((m) => m.id === rawVal);
                      display = proc?.name ?? rawVal;
                    } else {
                      display = rawVal;
                    }
                  }
                  return (
                    <div key={field.key} className={field.fullWidth ? "col-span-2" : ""}>
                      <p className="text-xs text-[#9CA3AF] mb-0.5">{field.label}</p>
                      <p className="text-sm text-[#1A1A2E]">{display}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Notes */}
            {viewEvent.description && (
              <div className="pt-3 border-t border-[#F3F4F6]">
                <p className="text-xs text-[#9CA3AF] mb-0.5">Notes</p>
                <p className="text-sm text-[#1A1A2E] italic">{viewEvent.description}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              {canEdit && (
                <button
                  onClick={() => { setViewEvent(null); openEditEvent(viewEvent); }}
                  className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
                >
                  Edit
                </button>
              )}
              <button onClick={() => setViewEvent(null)}
                className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition">
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Event Modal ── */}
      {editEvent && (
        <Modal title={`Edit — ${EVENT_LABELS[editEventCategory] ?? editEventCategory}`} onClose={() => setEditEvent(null)}>
          <form onSubmit={handleSaveEvent} className="space-y-5">
            {/* Category (read-only display, can't change category as it would break field semantics) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280] font-medium">Category:</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-[#4A6FA5]">
                {EVENT_LABELS[editEventCategory] ?? editEventCategory}
              </span>
            </div>

            {/* Dynamic category fields */}
            {editEventCategory && CATEGORY_FIELDS[editEventCategory] && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[#F3F4F6]">
                {CATEGORY_FIELDS[editEventCategory].map((field) => (
                  <Field key={field.key} label={field.label} fullWidth={field.fullWidth}>
                    {field.type === "datetime" && (
                      <DateTimeField
                        value={editEventDetails[field.key] ?? ""}
                        onChange={(v) => setEditDetail(field.key, v)}
                      />
                    )}
                    {field.type === "text" && (
                      <input
                        type="text"
                        value={editEventDetails[field.key] ?? ""}
                        onChange={(e) => setEditDetail(field.key, e.target.value)}
                        className={inp}
                      />
                    )}
                    {field.type === "select" && (
                      <select
                        value={editEventDetails[field.key] ?? ""}
                        onChange={(e) => setEditDetail(field.key, e.target.value)}
                        className={inp}
                      >
                        <option value="">Select…</option>
                        {field.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                    {field.type === "proceeding_select" && (
                      <select
                        value={editEventDetails[field.key] ?? ""}
                        onChange={(e) => setEditDetail(field.key, e.target.value)}
                        className={inp}
                      >
                        <option value="">Select…</option>
                        {[...(mastersByType["proceeding_type"] ?? [])]
                          .filter((m) => m.parent_id === (appeal.act_regulation as any)?.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </Field>
                ))}
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

            {editEventError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{editEventError}</div>}

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setEditEvent(null)}
                className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">
                Cancel
              </button>
              <button type="submit" disabled={editEventSaving}
                className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                {editEventSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Add Event Modal ── */}
      {addEventProcId && (
        <Modal title="Add Event" onClose={() => setAddEventProcId(null)}>
          <form onSubmit={handleAddEvent} className="space-y-5">
            {/* Category selector */}
            <Field label="Category *">
              <select value={eventCategory} onChange={(e) => handleEventCategoryChange(e.target.value)} className={inp}>
                <option value="">Select category…</option>
                {Object.entries(EVENT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </Field>

            {/* Dynamic category fields */}
            {eventCategory && CATEGORY_FIELDS[eventCategory] && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[#F3F4F6]">
                {CATEGORY_FIELDS[eventCategory].map((field) => (
                  <Field key={field.key} label={field.label} fullWidth={field.fullWidth}>
                    {field.type === "datetime" && (
                      <DateTimeField
                        value={eventDetails[field.key] ?? ""}
                        onChange={(v) => setDetail(field.key, v)}
                      />
                    )}
                    {field.type === "text" && (
                      <input
                        type="text"
                        value={eventDetails[field.key] ?? ""}
                        onChange={(e) => setDetail(field.key, e.target.value)}
                        className={inp}
                      />
                    )}
                    {field.type === "select" && (
                      <select
                        value={eventDetails[field.key] ?? ""}
                        onChange={(e) => setDetail(field.key, e.target.value)}
                        className={inp}
                      >
                        <option value="">Select…</option>
                        {field.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                    {field.type === "proceeding_select" && (
                      <select
                        value={eventDetails[field.key] ?? ""}
                        onChange={(e) => setDetail(field.key, e.target.value)}
                        className={inp}
                      >
                        <option value="">Select…</option>
                        {[...(mastersByType["proceeding_type"] ?? [])]
                          .filter((m) => m.parent_id === (appeal.act_regulation as any)?.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </Field>
                ))}
              </div>
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
            <div className="border-t border-[#F3F4F6] pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#6B7280]">Attachments (optional)</span>
                <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Choose Files
                  <input type="file" multiple className="hidden" onChange={addEventFileSelect} />
                </label>
              </div>
              {addEventPendingFiles.map(({ file, desc }, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="text-xs text-[#1A1A2E] truncate w-28 flex-shrink-0">{file.name}</span>
                  <input type="text" placeholder="Description (optional)" value={desc}
                    onChange={(e) => setAddEventPendingFiles((prev) => prev.map((p, i) => i === idx ? { ...p, desc: e.target.value } : p))}
                    className="flex-1 px-2 py-0.5 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]" />
                  <button type="button" onClick={() => setAddEventPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-0.5 text-[#9CA3AF] hover:text-red-500 transition flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {eventError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{eventError}</div>}

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => { setAddEventProcId(null); setAddEventPendingFiles([]); }}
                className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">
                Cancel
              </button>
              <button type="submit" disabled={eventSaving}
                className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                {eventSaving ? "Adding…" : "Add Event"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Confirm Delete Proceeding ── */}
      {confirmDeleteProc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Proceeding?</h3>
            <p className="text-sm text-[#6B7280] mb-1">
              This will also delete all <strong>{confirmDeleteProc.events.length} event{confirmDeleteProc.events.length !== 1 ? "s" : ""}</strong> under this proceeding.
            </p>
            <p className="text-xs text-[#9CA3AF] mb-5">Deleted items move to Trash and can be restored within 30 days.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteProc(null)}
                disabled={deletingProc}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
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
      {confirmDeleteEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Event?</h3>
            <p className="text-sm text-[#6B7280] mb-5">
              Delete <strong>{EVENT_LABELS[confirmDeleteEvent.category] ?? confirmDeleteEvent.category}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteEvent(null)}
                disabled={deletingEvent}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                disabled={deletingEvent}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {deletingEvent ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Appeal ── */}
      {confirmDeleteAppeal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Litigation?</h3>
            <p className="text-sm text-[#6B7280] mb-1">
              This will permanently delete this litigation along with all its proceedings and events.
            </p>
            <p className="text-sm font-medium text-red-600 mb-4">This action cannot be undone.</p>
            {deleteAppealError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {deleteAppealError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmDeleteAppeal(false); setDeleteAppealError(null); }}
                disabled={deletingAppeal}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
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
