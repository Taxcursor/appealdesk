"use client";

import { useState, useEffect, useRef } from "react";
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
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && _escStack.length > 0) _escStack[_escStack.length - 1]();
  }, true);
}
function useEscHandler(handler: () => void, active: boolean) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; });
  useEffect(() => {
    if (!active) return;
    const fn = () => handlerRef.current();
    _escStack.push(fn);
    return () => { const i = _escStack.indexOf(fn); if (i !== -1) _escStack.splice(i, 1); };
  }, [active]);
}

import {
  updateAppeal, updateProceeding, addProceeding, addEvent, updateEvent,
  deleteEvent, deleteAppeal, deleteProceeding,
  uploadProceedingDocument, deleteProceedingDocument,
  uploadEventDocument, deleteEventDocument,
  ProceedingInput, EventInput,
} from "@/app/(sp)/litigations/actions";
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
function filterFYForAct(fyOptions: { id: string; name: string }[], actName: string | undefined) {
  if (actName === "The Income-tax Act, 1961") {
    return fyOptions.filter(m => parseInt(m.name.slice(0, 4)) < 2026);
  }
  if (actName === "The Income-tax Act, 2025") {
    return fyOptions.filter(m => parseInt(m.name.slice(0, 4)) >= 2026);
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
  possible_outcome: string | null;
  status: string | null;
  is_active: boolean;
  created_at: string;
  deleted_at?: string | null;
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

const MAIN_CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  notice_from_authority: [
    { key: "date_of_notice", label: "Notice Date", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  show_cause_notice: [
    { key: "date_of_notice", label: "Notice Date", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  personal_hearing_notice: [
    { key: "hearing_date", label: "Hearing Date", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  virtual_hearing_notice: [
    { key: "hearing_date", label: "Hearing Date", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  assessment_order: [
    { key: "date_of_order", label: "Date of Order", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  penalty_order: [
    { key: "date_of_order", label: "Date of Order", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  filing_of_appeal: [
    { key: "appeal_against_proceeding", label: "Appeal Against Proceeding", type: "proceeding_select", fullWidth: true },
    { key: "order_date", label: "Order Date", type: "datetime" },
    { key: "due_date", label: "Due Date for Filing Appeal", type: "datetime" },
    { key: "target_date_filing", label: "Target Date for Filing Appeal", type: "datetime" },
    { key: "appeal_filed_on", label: "Appeal Filed On", type: "datetime" },
  ],
  others: [
    { key: "date", label: "Date", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
};

const SUB_CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  response_to_notice: [
    { key: "response_submitted_on", label: "Response Submitted On", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
  adjournment_request: [
    { key: "adjourned_to", label: "Adjourned To", type: "datetime" },
  ],
  personal_follow_up: [
    { key: "follow_up_with", label: "Follow Up With", type: "text" },
    { key: "follow_up_by", label: "Follow Up By", type: "text" },
  ],
  others_sub: [
    { key: "date", label: "Date", type: "datetime" },
    { key: "due_date", label: "Due Date", type: "datetime" },
  ],
};

const CATEGORY_FIELDS: Record<string, FieldDef[]> = { ...MAIN_CATEGORY_FIELDS, ...SUB_CATEGORY_FIELDS };

const PRIMARY_DATE: Record<string, string> = {
  notice_from_authority: "date_of_notice",
  show_cause_notice: "date_of_notice",
  personal_hearing_notice: "hearing_date",
  virtual_hearing_notice: "hearing_date",
  assessment_order: "date_of_order",
  penalty_order: "date_of_order",
  filing_of_appeal: "order_date",
  others: "date",
  response_to_notice: "response_submitted_on",
  adjournment_request: "adjourned_to",
  others_sub: "date",
};

const DUE_DATE_KEY: Record<string, string> = {
  notice_from_authority: "due_date",
  show_cause_notice: "due_date",
  personal_hearing_notice: "due_date",
  virtual_hearing_notice: "due_date",
  assessment_order: "due_date",
  penalty_order: "due_date",
  filing_of_appeal: "due_date",
  others: "due_date",
  response_to_notice: "due_date",
  adjournment_request: "adjourned_to",
  others_sub: "due_date",
};

// Maps each main event category → the date field to surface in sub-event parent info panels.
const PARENT_DATE_FIELD: Record<string, { key: string; label: string }> = {
  notice_from_authority:   { key: "date_of_notice", label: "Notice Date" },
  show_cause_notice:       { key: "date_of_notice", label: "Notice Date" },
  personal_hearing_notice: { key: "hearing_date",   label: "Hearing Date" },
  virtual_hearing_notice:  { key: "hearing_date",   label: "Hearing Date" },
  assessment_order:        { key: "date_of_order",  label: "Date of Order" },
  penalty_order:           { key: "date_of_order",  label: "Date of Order" },
  filing_of_appeal:        { key: "appeal_filed_on", label: "Appeal Filed On" },
  others:                  { key: "date",            label: "Date" },
};

const MAIN_EVENT_LABELS: Record<string, string> = {
  notice_from_authority: "Notice from Authority",
  show_cause_notice: "Show Cause Notice (SCN)",
  personal_hearing_notice: "Personal Hearing Notice",
  virtual_hearing_notice: "Virtual Hearing Notice",
  assessment_order: "Assessment Order",
  penalty_order: "Penalty Order",
  filing_of_appeal: "Filing of Appeal",
  others: "Others",
};

const SUB_EVENT_LABELS: Record<string, string> = {
  response_to_notice: "Response to Notice",
  adjournment_request: "Adjournment Request",
  personal_follow_up: "Personal Follow-up",
  others_sub: "Others",
};

const EVENT_LABELS: Record<string, string> = { ...MAIN_EVENT_LABELS, ...SUB_EVENT_LABELS };

function getEventLabel(category: string, details?: Record<string, string> | null): string {
  if ((category === "others" || category === "others_sub") && details?.category_name?.trim()) {
    return `Others (${details.category_name.trim()})`;
  }
  return EVENT_LABELS[category] ?? category;
}

const EVENT_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-blue-50 text-blue-700" },
  in_progress: { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
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
        className="px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] w-32 shrink-0"
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
        <svg className="w-3.5 h-3.5 text-[#4A6FA5] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#1A1A2E] truncate">{doc.file_name}</span>
            {doc.file_size && <span className="text-xs text-[#9CA3AF] shrink-0">{(doc.file_size / 1024).toFixed(0)} KB</span>}
          </div>
          {doc.description && <p className="text-xs text-[#6B7280] mt-0.5">{doc.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="View file"
          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        </a>
        <a href={doc.file_url} download={doc.file_name} title="Download file"
          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </a>
        {canEdit && (
          <button type="button" onClick={onDelete} title="Delete file" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex">
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
  const [uploadedDocs, setUploadedDocs] = useState<AttachedFile[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const serverDocIds = new Set(docs.map((d) => d.id));
  const activeDocs = [
    ...docs.filter((d) => !d.deleted_at && !deletedIds.has(d.id)),
    ...uploadedDocs.filter((d) => !deletedIds.has(d.id) && !serverDocIds.has(d.id)),
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
        const path = `proceeding-docs/${proceedingId}/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
        if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
        const docId = await uploadProceedingDocument(proceedingId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        setUploadedDocs((prev) => [...prev, { id: docId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size, description: desc.trim() || null, created_at: new Date().toISOString() }]);
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
      setDeletedIds((prev) => new Set([...prev, confirmDelete.id]));
      setUploadedDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
      setConfirmDelete(null);
    } finally { setDeleting(false); }
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
        {error && pendingFiles.length === 0 && (
          <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>
        )}
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
                <svg className="w-3.5 h-3.5 text-[#4A6FA5] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs text-[#1A1A2E] font-medium truncate w-32 shrink-0">{file.name}</span>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={desc}
                  onChange={(e) => updateDesc(idx, e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] bg-white"
                />
                <button type="button" onClick={() => removePending(idx)}
                  className="p-1 text-[#9CA3AF] hover:text-red-500 transition shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleUploadAll} disabled={uploading}
                className="px-3 py-1 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium disabled:opacity-50">
                {uploading ? "Uploading…" : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
              </button>
              <button type="button" onClick={() => { setPendingFiles([]); setError(null); }}
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
            <p className="text-sm text-[#6B7280] mb-5">Delete <strong>&quot;{confirmDelete.file_name}&quot;</strong>? This will move it to trash.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
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
  const [uploadedDocs, setUploadedDocs] = useState<AttachedFile[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const serverDocIds = new Set(docs.map((d) => d.id));
  const activeDocs = [
    ...docs.filter((d) => !d.deleted_at && !deletedIds.has(d.id)),
    ...uploadedDocs.filter((d) => !deletedIds.has(d.id) && !serverDocIds.has(d.id)),
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
        const path = `event-docs/${eventId}/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
        if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
        const docId = await uploadEventDocument(eventId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        setUploadedDocs((prev) => [...prev, { id: docId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size, description: desc.trim() || null, created_at: new Date().toISOString() }]);
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
      setDeletedIds((prev) => new Set([...prev, confirmDelete.id]));
      setUploadedDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
      setConfirmDelete(null);
    } finally { setDeleting(false); }
  }

  return (
    <div className="mt-2">
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
        {error && pendingFiles.length === 0 && (
          <div className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>
        )}
        {activeDocs.length === 0 && pendingFiles.length === 0 ? (
          <div className="px-4 py-3 text-center text-xs text-[#9CA3AF]">No attachments.{canEdit ? " Use Choose Files to add files." : ""}</div>
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
                <svg className="w-3.5 h-3.5 text-[#4A6FA5] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs text-[#1A1A2E] font-medium truncate w-32 shrink-0">{file.name}</span>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={desc}
                  onChange={(e) => updateDesc(idx, e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] bg-white"
                />
                <button type="button" onClick={() => removePending(idx)}
                  className="p-1 text-[#9CA3AF] hover:text-red-500 transition shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleUploadAll} disabled={uploading}
                className="px-3 py-1 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium disabled:opacity-50">
                {uploading ? "Uploading…" : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
              </button>
              <button type="button" onClick={() => { setPendingFiles([]); setError(null); }}
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
            <p className="text-sm text-[#6B7280] mb-5">Delete <strong>&quot;{confirmDelete.file_name}&quot;</strong>? This will move it to trash.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
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

// ─── Multi-select dropdown ────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useState(() => ({ current: null as HTMLDivElement | null }))[0];

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  }

  const selectedLabels = options.filter(o => selected.includes(o.value)).map(o => o.label);

  return (
    <div className="relative" ref={(el) => { ref.current = el; }}>
      <div
        onClick={() => setOpen(o => !o)}
        className={`${inp} flex items-center justify-between gap-2 cursor-pointer min-h-[42px] flex-wrap`}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-[#9CA3AF] text-sm">{placeholder ?? "Select…"}</span>
        ) : (
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedLabels.map((label, i) => (
              <span key={i} className="inline-flex px-2 py-0.5 bg-[#EEF2FF] text-[#4A6FA5] rounded text-xs font-medium">
                {label}
              </span>
            ))}
          </div>
        )}
        <svg className={`w-4 h-4 shrink-0 text-[#6B7280] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[#9CA3AF]">No options available</div>
            ) : options.map(opt => (
              <div key={opt.value} onClick={() => toggle(opt.value)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-[#F3F4F6] cursor-pointer">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.includes(opt.value) ? "bg-[#1E3A5F] border-[#1E3A5F]" : "border-[#D1D5DB]"}`}>
                  {selected.includes(opt.value) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-[#1A1A2E]">{opt.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Proceeding Form Fields ────────────────────────────────────────
function ProceedingFormFields({
  values, onChange, onMultiChange, mastersByType, teamMembers, clientUsers, actRegulationId,
}: {
  values: ProceedingInput;
  onChange: (field: keyof ProceedingInput, value: string) => void;
  onMultiChange: (field: keyof ProceedingInput, value: string[]) => void;
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
        <MultiSelect
          options={[...teamMembers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(m => ({ value: m.id, label: `${m.first_name} ${m.last_name}` }))}
          selected={values.assigned_to_ids ?? []}
          onChange={(ids) => onMultiChange("assigned_to_ids", ids)}
          placeholder="Unassigned"
        />
      </Field>
      <Field label="Client Staff">
        <MultiSelect
          options={[...clientUsers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` }))}
          selected={values.client_staff_ids ?? []}
          onChange={(ids) => onMultiChange("client_staff_ids", ids)}
          placeholder="None"
        />
      </Field>
      <Field label="Possible Outcome">
        <select value={values.possible_outcome ?? ""} onChange={(e) => onChange("possible_outcome", e.target.value)} className={inp}>
          <option value="">Select…</option>
          <option value="doubtful">Doubtful</option>
          <option value="favourable">Favourable</option>
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
function Modal({ title, onClose, isDirty, children }: {
  title: string;
  onClose: () => void;
  isDirty?: boolean;
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
      <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold text-[#1A1A2E]">{title}</h3>
          <button onClick={handleClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
      {showDiscard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Discard Changes?</h3>
            <p className="text-sm text-[#6B7280] mb-5">You have unsaved changes. Discard them and close?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDiscard(false)}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">
                Keep Editing
              </button>
              <button onClick={() => { setShowDiscard(false); onClose(); }}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function AppealDetailClient({ appeal, clients, teamMembers, clientUsers, mastersByType, canEdit }: Props) {
  const router = useRouter();
  const clientOrg = appeal.client_org ?? null;

  // Refs that capture initial form values for dirty-checking edit modals
  const editProcInitRef = useRef<ProceedingInput>({});
  const editEventInitRef = useRef<{ category: string; details: Record<string, string>; description: string; status: string; noticeNumber: string; parentId: string | null }>(
    { category: "", details: {}, description: "", status: "open", noticeNumber: "", parentId: null }
  );

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
  const editActName = editActObj?.name;
  const editIsITAct1961 = editActName === "The Income-tax Act, 1961";
  const editIsITAct2025 = editActName === "The Income-tax Act, 2025";
  const editHideAY = !!(editActName?.includes("Income-tax Act, 2025") || editActName?.toLowerCase().includes("central goods"));
  const detailHideAY = !!(appeal.act_regulation?.name?.includes("Income-tax Act, 2025") || appeal.act_regulation?.name?.toLowerCase().includes("central goods"));
  const editFYObj = (mastersByType["financial_year"] ?? []).find(m => m.id === editFY);
  const editFYName = editFYObj?.name ?? "";
  const editAYDisabled = !editIsITAct1961 || (editFYName ? isAYDisabled(editFYName) : false);
  const editAYName = editAYDisabled ? "Not applicable"
    : ((mastersByType["assessment_year"] ?? []).find(m => m.id === editAY)?.name ?? "—");
  const editAvailableFY = filterFYForAct(mastersByType["financial_year"] ?? [], editActName);

  function handleEditActChange(actId: string) {
    setEditAct(actId);
    setEditFY("");
    setEditAY("");
  }

  function handleEditFYChange(fyId: string) {
    setEditFY(fyId);
    if (!fyId || !editIsITAct1961) { setEditAY(""); return; }
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
      possible_outcome: proc.possible_outcome ?? "",
      status: proc.status ?? "open",
    };
    editProcInitRef.current = initValues;
    setEditProc(proc);
    setEditProcValues(initValues);
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

  async function handleAddProc(e: React.FormEvent) {
    e.preventDefault();
    setAddProcSaving(true); setAddProcError(null);
    try {
      const procId = await addProceeding(appeal.id, addProcValues);
      if (addProcPendingFiles.length > 0) {
        const supabase = createClient();
        for (const { file, desc } of addProcPendingFiles) {
          const path = `proceeding-docs/${procId}/${Date.now()}-${sanitizeFileName(file.name)}`;
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
  const [addEventParentId, setAddEventParentId] = useState<string | null>(null); // null = main, string = parent main event ID for sub
  const [eventCategory, setEventCategory] = useState("");
  const [eventDetails, setEventDetails] = useState<Record<string, string>>({});
  const [eventDescription, setEventDescription] = useState("");
  const [eventStatus, setEventStatus] = useState("open");
  const [eventNoticeNumber, setEventNoticeNumber] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [addEventPendingFiles, setAddEventPendingFiles] = useState<{ file: File; desc: string }[]>([]);

  // ── View Event ──
  const [viewEvent, setViewEvent] = useState<AppEvent | null>(null);

  // ── Edit Event ──
  const [editEvent, setEditEvent] = useState<AppEvent | null>(null);
  const [editEventType, setEditEventType] = useState<"main" | "sub">("main");
  const [editEventCategory, setEditEventCategory] = useState("");
  const [editEventDetails, setEditEventDetails] = useState<Record<string, string>>({});
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventStatus, setEditEventStatus] = useState("open");
  const [editEventNoticeNumber, setEditEventNoticeNumber] = useState("");
  const [editEventParentId, setEditEventParentId] = useState<string | null>(null);
  const [editEventProceedingId, setEditEventProceedingId] = useState<string>("");
  const [editEventSaving, setEditEventSaving] = useState(false);
  const [editEventError, setEditEventError] = useState<string | null>(null);

  function openEditEvent(ev: AppEvent) {
    const initDetails = ev.details ? { ...ev.details } : {};
    const procId = (appeal.proceedings ?? []).find(p =>
      (p.events ?? []).some(e => e.id === ev.id)
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
  }

  function setEditDetail(key: string, value: string) {
    setEditEventDetails((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editEvent || !editEventCategory) { setEditEventError("Category is required."); return; }
    setEditEventSaving(true); setEditEventError(null);
    try {
      const effectiveCategory = editEventType === "sub" && editEventCategory === "others" ? "others_sub" : editEventCategory;
      const primaryKey = PRIMARY_DATE[effectiveCategory];
      const primaryDate = primaryKey && editEventDetails[primaryKey]
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

  function openAddMainEvent(procId: string) {
    setAddEventProcId(procId);
    setAddEventParentId(null);
    setEventCategory(""); setEventDetails({}); setEventDescription(""); setEventError(null);
    setEventStatus("open");
    setEventNoticeNumber("");
    setAddEventPendingFiles([]);
  }

  function openAddSubEvent(procId: string, masterEventId: string) {
    setAddEventProcId(procId);
    setAddEventParentId(masterEventId);
    setEventCategory(""); setEventDetails({}); setEventDescription(""); setEventError(null);
    setEventStatus("open");
    setEventNoticeNumber("");
    setAddEventPendingFiles([]);
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
    const isSubEvent = addEventParentId !== null;
    try {
      const effectiveCategory = isSubEvent && eventCategory === "others" ? "others_sub" : eventCategory;
      const primaryKey = PRIMARY_DATE[effectiveCategory];
      const primaryDate = primaryKey && eventDetails[primaryKey]
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
          const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
          if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
          const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
          await uploadEventDocument(eventId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        }
      }
      setAddEventProcId(null); setAddEventParentId(null); setAddEventPendingFiles([]);
      router.refresh();
    } catch (err) {
      setEventError(err instanceof Error ? err.message : "Failed to add event.");
    } finally { setEventSaving(false); }
  }

  const proceedingFormChange = (setter: React.Dispatch<React.SetStateAction<ProceedingInput>>) =>
    (field: keyof ProceedingInput, value: string) => setter((prev) => ({ ...prev, [field]: value }));
  const proceedingMultiChange = (setter: React.Dispatch<React.SetStateAction<ProceedingInput>>) =>
    (field: keyof ProceedingInput, value: string[]) => setter((prev) => ({ ...prev, [field]: value }));

  // ── ESC for delete confirm dialogs ──
  useEscHandler(() => setConfirmDeleteProc(null), !!confirmDeleteProc);
  useEscHandler(() => setConfirmDeleteEvent(null), !!confirmDeleteEvent);
  useEscHandler(() => { setConfirmDeleteAppeal(false); setDeleteAppealError(null); }, confirmDeleteAppeal);

  // ── isDirty flags for each modal ──
  const editAppealIsDirty = showEditAppeal && (
    editClientId !== (clientOrg?.id ?? "") ||
    editFY !== (appeal.financial_year?.id ?? "") ||
    editAY !== (appeal.assessment_year?.id ?? "") ||
    editAct !== (appeal.act_regulation?.id ?? "") ||
    editAppealStatus !== (appeal.status ?? "open")
  );
  const editProcIsDirty = !!editProc &&
    JSON.stringify(editProcValues) !== JSON.stringify(editProcInitRef.current);
  const addProcIsDirty = showAddProc && (
    addProcPendingFiles.length > 0 ||
    Object.values(addProcValues).some(v => Array.isArray(v) ? v.length > 0 : !!v)
  );
  const editEventIsDirty = !!editEvent && (
    editEventCategory !== editEventInitRef.current.category ||
    JSON.stringify(editEventDetails) !== JSON.stringify(editEventInitRef.current.details) ||
    editEventDescription !== editEventInitRef.current.description ||
    editEventStatus !== editEventInitRef.current.status ||
    editEventNoticeNumber !== editEventInitRef.current.noticeNumber ||
    editEventParentId !== editEventInitRef.current.parentId
  );
  const addEventIsDirty = !!addEventProcId && (
    !!eventCategory ||
    Object.values(eventDetails).some(v => !!v) ||
    !!eventDescription ||
    !!eventNoticeNumber ||
    addEventPendingFiles.length > 0
  );

  const sortedProceedings = [...(appeal.proceedings ?? [])]
    .filter((p) => !p.deleted_at)
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

  // Tracks which main event rows have their sub events expanded
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());
  function toggleMaster(id: string) {
    setExpandedMasters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Flat lookup of all events by ID — used to resolve parent main event for sub events
  const allEventsById = (appeal.proceedings ?? []).reduce((acc, p) => {
    (p.events ?? []).filter(e => !e.deleted_at).forEach(e => { acc[e.id] = e as AppEvent; });
    return acc;
  }, {} as Record<string, AppEvent>);

  // ── Render ──
  return (
    <div className="space-y-4 max-w-4xl">

      {/* Appeal Header */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm flex items-start justify-between gap-4">
        <div className={`grid ${detailHideAY ? "grid-cols-4" : "grid-cols-5"} gap-6 flex-1`}>
          <DetailRow label="Client" value={<span className="font-medium">{clientOrg?.name}</span>} />
          <DetailRow label="Financial Year" value={appeal.financial_year?.name} />
          {!detailHideAY && <DetailRow label="Assessment Year" value={appeal.assessment_year?.name} />}
          <DetailRow label="Act / Regulation" value={appeal.act_regulation?.name} />
          <DetailRow label="Status" value={(() => { const s = STATUS_CFG[appeal.status ?? "open"]; return s ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span> : null; })()} />
        </div>
        {canEdit && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => { setEditClientId(clientOrg?.id ?? ""); setEditFY(appeal.financial_year?.id ?? ""); setEditAY(appeal.assessment_year?.id ?? ""); setEditAct(appeal.act_regulation?.id ?? ""); setEditAppealStatus(appeal.status ?? "open"); setAppealError(null); setShowEditAppeal(true); }}
              title="Edit Litigation" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button
              onClick={() => setConfirmDeleteAppeal(true)}
              title="Delete Litigation" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
            const assignedNames = (proc.assigned_to_ids ?? []).map(id => teamMembers.find(m => m.id === id)).filter(Boolean).map(m => `${m!.first_name} ${m!.last_name}`);
            const clientStaffNames = (proc.client_staff_ids ?? []).map(id => clientUsers.find(u => u.id === id)).filter(Boolean).map(u => `${u!.first_name} ${u!.last_name}`);
            const sortedEvents = [...(proc.events ?? [])]
              .filter((e) => !e.deleted_at)
              .sort((a, b) => a.created_at.localeCompare(b.created_at));
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
                    className={`w-4 h-4 shrink-0 text-[#9CA3AF] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Number */}
                  <span className="text-xs text-[#9CA3AF] font-medium bg-[#F3F4F6] px-2 py-0.5 rounded shrink-0">
                    #{idx + 1}
                  </span>

                  {/* Forum / type */}
                  <span className="font-semibold text-[#1A1A2E] text-sm truncate">
                    {proc.proceeding_type?.name ?? "—"}
                  </span>

                  {/* Badges + actions */}
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${impCfg ? impCfg.cls : "bg-[#F3F4F6] text-[#9CA3AF]"}`}>{impCfg ? impCfg.label : "—"}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#F3F4F6] text-[#6B7280] capitalize hidden md:inline-flex">{proc.mode ?? "—"}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${procStatusCfg ? procStatusCfg.cls : "bg-[#F3F4F6] text-[#9CA3AF]"}`}>{procStatusCfg ? procStatusCfg.label : "—"}</span>
                    <span className="text-xs text-[#6B7280] hidden lg:block">Due {proc.to_be_completed_by ? fmtDate(proc.to_be_completed_by) : "—"}</span>
                    {/* Attachment count — always shown */}
                    {(() => { const cnt = (proc.proceeding_documents ?? []).filter(d => !d.deleted_at).length; return (
                      <span className="inline-flex items-center gap-0.5 text-xs text-[#6B7280]">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        {cnt}
                      </span>
                    ); })()}
                    {/* Edit / Delete icons */}
                    {canEdit && (
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEditProc(proc)} title="Edit Proceeding" className="p-1.5 rounded hover:bg-[#D8E3F5] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => setConfirmDeleteProc(proc)} title="Delete Proceeding" className="p-1.5 rounded hover:bg-[#D8E3F5] transition-colors text-red-400 hover:text-red-600 inline-flex">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
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
                      <DetailRow label="Assigned To" value={assignedNames.length > 0 ? assignedNames.join(", ") : null} />
                      <DetailRow label="Client Staff" value={clientStaffNames.length > 0 ? clientStaffNames.join(", ") : null} />
                      <DetailRow label="Initiated On" value={fmtDate(proc.initiated_on)} />
                      <DetailRow label="Deadline" value={fmtDate(proc.to_be_completed_by)} />
                      <DetailRow label="Possible Outcome" value={outCfg ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outCfg.cls}`}>{outCfg.label}</span>
                      ) : null} />
                    </div>

                    {/* Proceeding Attachments */}
                    <ProceedingAttachments
                      proceedingId={proc.id}
                      docs={proc.proceeding_documents ?? []}
                      canEdit={canEdit}
                    />

                    {/* Events */}
                    {(() => {
                      const mainEvents = sortedEvents.filter(e => e.event_type === "main");
                      const subEventsByParent: Record<string, AppEvent[]> = {};
                      const orphanedSubs: AppEvent[] = [];
                      sortedEvents.filter(e => e.event_type === "sub").forEach(e => {
                        if (e.parent_event_id) {
                          if (!subEventsByParent[e.parent_event_id]) subEventsByParent[e.parent_event_id] = [];
                          subEventsByParent[e.parent_event_id].push(e);
                        } else {
                          orphanedSubs.push(e);
                        }
                      });

                      function EventActions({ ev }: { ev: AppEvent }) {
                        return (
                          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setViewEvent(ev)} title="View" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </button>
                            {canEdit && (
                              <>
                                <button onClick={() => openEditEvent(ev)} title="Edit" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => setConfirmDeleteEvent(ev)} title="Delete" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </>
                            )}
                          </div>
                        );
                      }

                      function EventRow({ ev, isSub }: { ev: AppEvent; isSub?: boolean }) {
                        const effectiveCat = ev.event_type === "sub" && ev.category === "others" ? "others_sub" : ev.category;
                        const primaryKey = PRIMARY_DATE[effectiveCat];
                        const noticeDate = primaryKey && ev.details?.[primaryKey]
                          ? fmtDateTime(ev.details[primaryKey])
                          : ev.event_date ? fmtDateTime(ev.event_date) : "—";
                        const dueDateKey = DUE_DATE_KEY[effectiveCat];
                        const dueDate = dueDateKey && ev.details?.[dueDateKey] ? fmtDateTime(ev.details[dueDateKey]) : "—";
                        const statusCfg = EVENT_STATUS_CFG[ev.status ?? "open"] ?? EVENT_STATUS_CFG.open;
                        return (
                          <div className={isSub ? "bg-white border-t border-[#F3F4F6]" : ""}>
                            {/* Single-record row — no detail panel below */}
                            <div
                              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isSub ? "pl-6 bg-[#FAFBFF]" : "bg-[#F8FAFF] cursor-pointer hover:bg-[#F8F9FA]"}`}
                            >
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${isSub ? "bg-purple-50 text-purple-700" : "bg-[#EEF2FF] text-[#4A6FA5]"}`}>
                                {isSub ? "Sub" : "Main"}
                              </span>
                              <span className="text-xs text-[#1A1A2E] font-medium flex-1 min-w-0 truncate">{getEventLabel(ev.category, ev.details)}</span>
                              <div className="ml-auto flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap hidden sm:inline-flex">
                                  <span className="text-xs text-[#9CA3AF]">Notice:</span>
                                  <span className="text-xs text-[#6B7280]">{noticeDate}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 whitespace-nowrap hidden md:inline-flex">
                                  <span className="text-xs text-[#9CA3AF]">Due:</span>
                                  <span className="text-xs text-[#6B7280]">{dueDate}</span>
                                </span>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
                                {(() => { const cnt = (ev.event_documents ?? []).filter(d => !d.deleted_at).length; return (
                                  <span className="inline-flex items-center gap-0.5 text-xs text-[#6B7280] shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                    {cnt}
                                  </span>
                                ); })()}
                                <EventActions ev={ev} />
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="px-5 py-4 bg-[#EBF1F9]">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Events ({mainEvents.length})</p>
                            {canEdit && (
                              <button onClick={(e) => { e.stopPropagation(); openAddMainEvent(proc.id); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg transition">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Add Main Event
                              </button>
                            )}
                          </div>

                          {sortedEvents.length === 0 ? (
                            <p className="text-xs text-[#9CA3AF]">No events recorded yet.</p>
                          ) : (
                            <div className="rounded-lg border border-[#E5E7EB] overflow-hidden divide-y divide-[#E5E7EB]">
                              {/* Main events with their sub events */}
                              {mainEvents.map((master, mIdx) => {
                                const subs = subEventsByParent[master.id] ?? [];
                                const isSubsExpanded = expandedMasters.has(master.id);
                                return (
                                  <div key={master.id}>
                                    {/* Main row — click to expand/collapse sub events */}
                                    <div
                                      className="flex items-center gap-3 px-3 py-2.5 bg-[#F8FAFF] cursor-pointer hover:bg-[#EEF2FF] transition-colors"
                                      onClick={() => toggleMaster(master.id)}
                                    >
                                      <svg className={`w-3.5 h-3.5 shrink-0 text-[#9CA3AF] transition-transform duration-150 ${isSubsExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                      </svg>
                                      <span className="text-xs text-[#9CA3AF] font-medium bg-[#F3F4F6] px-1.5 py-0.5 rounded shrink-0">#{mIdx + 1}</span>
                                      <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 bg-[#EEF2FF] text-[#4A6FA5]">Main</span>
                                      <span className="text-xs text-[#1A1A2E] font-medium flex-1 min-w-0 truncate">{getEventLabel(master.category, master.details)}</span>
                                      <div className="ml-auto flex items-center gap-2 shrink-0">
                                        {(() => {
                                          const effectiveCat = master.category;
                                          const primaryKey = PRIMARY_DATE[effectiveCat];
                                          const noticeDate = primaryKey && master.details?.[primaryKey] ? fmtDateTime(master.details[primaryKey]) : master.event_date ? fmtDateTime(master.event_date) : "—";
                                          const dueDateKey = DUE_DATE_KEY[effectiveCat];
                                          const dueDate = dueDateKey && master.details?.[dueDateKey] ? fmtDateTime(master.details[dueDateKey]) : "—";
                                          const statusCfg = EVENT_STATUS_CFG[master.status ?? "open"] ?? EVENT_STATUS_CFG.open;
                                          const cnt = (master.event_documents ?? []).filter(d => !d.deleted_at).length;
                                          return (
                                            <>
                                              <span className="inline-flex items-center gap-1 whitespace-nowrap hidden sm:inline-flex">
                                                <span className="text-xs text-[#9CA3AF]">Notice:</span>
                                                <span className="text-xs text-[#6B7280]">{noticeDate}</span>
                                              </span>
                                              <span className="inline-flex items-center gap-1 whitespace-nowrap hidden md:inline-flex">
                                                <span className="text-xs text-[#9CA3AF]">Due:</span>
                                                <span className="text-xs text-[#6B7280]">{dueDate}</span>
                                              </span>
                                              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
                                              <span className="inline-flex items-center gap-0.5 text-xs text-[#6B7280] shrink-0">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                                {cnt}
                                              </span>
                                            </>
                                          );
                                        })()}
                                        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                          <button onClick={() => setViewEvent(master)} title="View" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                          </button>
                                          {canEdit && (
                                            <>
                                              <button onClick={() => openEditEvent(master)} title="Edit" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                              </button>
                                              <button onClick={() => setConfirmDeleteEvent(master)} title="Delete" className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Sub events + Add Sub Event — shown when main row is expanded */}
                                    {isSubsExpanded && (
                                      <>
                                        {subs.map((sub) => (
                                          <EventRow key={sub.id} ev={sub} isSub />
                                        ))}
                                        {canEdit && (
                                          <div className="pl-8 pr-3 py-1.5 bg-white border-t border-[#F3F4F6]" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              onClick={() => openAddSubEvent(proc.id, master.id)}
                                              className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#4A6FA5] transition-colors"
                                            >
                                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
                              {orphanedSubs.map((ev) => (
                                <EventRow key={ev.id} ev={ev} isSub />
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
        <Modal title="Edit Litigation" onClose={() => setShowEditAppeal(false)} isDirty={editAppealIsDirty}>
          <form onSubmit={handleSaveAppeal} className="space-y-4">
            <Field label="Client Organisation">
              <select value={editClientId} onChange={(e) => setEditClientId(e.target.value)} className={inp}>
                <option value="">Select client…</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Act / Regulation" fullWidth>
                <select value={editAct} onChange={(e) => handleEditActChange(e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {[...(mastersByType["act_regulation"] ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label={editIsITAct2025 ? "Tax Year" : "Financial Year / Tax Year"} fullWidth={editHideAY}>
                <select value={editFY} onChange={(e) => handleEditFYChange(e.target.value)} className={inp} disabled={!editAct}>
                  <option value="">{editAct ? "Select…" : "Select Act first"}</option>
                  {[...editAvailableFY].sort((a, b) => b.name.localeCompare(a.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              {!editHideAY && (
                <Field label="Assessment Year">
                  <div className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280] cursor-not-allowed">
                    {editAYName}
                  </div>
                </Field>
              )}
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
        <Modal title="Edit Proceeding" onClose={() => setEditProc(null)} isDirty={editProcIsDirty}>
          <form onSubmit={handleSaveProc} className="space-y-4">
            <ProceedingFormFields values={editProcValues} onChange={proceedingFormChange(setEditProcValues)} onMultiChange={proceedingMultiChange(setEditProcValues)} mastersByType={mastersByType} teamMembers={teamMembers} clientUsers={clientUsers} actRegulationId={appeal.act_regulation?.id ?? undefined} />
            {editProcError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{editProcError}</div>}
            <div className="border-t border-[#E5E7EB] -mx-6 px-6 pt-4">
              <ProceedingAttachments proceedingId={editProc.id} docs={editProc.proceeding_documents ?? []} canEdit={canEdit} />
            </div>
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
        <Modal title="Add Proceeding" onClose={() => { setShowAddProc(false); setAddProcPendingFiles([]); }} isDirty={addProcIsDirty}>
          <form onSubmit={handleAddProc} className="space-y-4">
            <ProceedingFormFields values={addProcValues} onChange={proceedingFormChange(setAddProcValues)} onMultiChange={proceedingMultiChange(setAddProcValues)} mastersByType={mastersByType} teamMembers={teamMembers} clientUsers={clientUsers} actRegulationId={appeal.act_regulation?.id ?? undefined} />
            {/* Attachments */}
            <PendingAttachments files={addProcPendingFiles} onChange={setAddProcPendingFiles} />
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
        <Modal title={getEventLabel(viewEvent.category, viewEvent.details)} onClose={() => setViewEvent(null)} isDirty={false}>
          <div className="space-y-5">
            {/* Event type, notice number, status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${viewEvent.event_type === "sub" ? "bg-purple-50 text-purple-700" : "bg-[#EEF2FF] text-[#4A6FA5]"}`}>
                {viewEvent.event_type === "sub" ? "Sub Event" : "Main Event"}
              </span>
              {viewEvent.event_notice_number && (
                <span className="text-xs text-[#6B7280]">Order No: <span className="font-medium text-[#1A1A2E]">{viewEvent.event_notice_number}</span></span>
              )}
              {(() => { const s = EVENT_STATUS_CFG[viewEvent.status ?? "open"] ?? EVENT_STATUS_CFG.open; return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>; })()}
            </div>

            {/* Inherited from parent main event (sub events only) */}
            {viewEvent.event_type === "sub" && viewEvent.parent_event_id && (() => {
              const parent = allEventsById[viewEvent.parent_event_id];
              if (!parent) return null;
              const parentDateField = PARENT_DATE_FIELD[parent.category];
              const parentDateKey = parentDateField?.key;
              const parentDateLabel = parentDateField?.label ?? "Date";
              const parentNoticeDate = parentDateKey && parent.details?.[parentDateKey] ? fmtDateTime(parent.details[parentDateKey]) : parent.event_date ? fmtDateTime(parent.event_date) : null;
              return (
                <div className="rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] px-4 py-3 space-y-2">

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[#9CA3AF] mb-0.5">Order No.</p>
                      <p className="text-sm text-[#9CA3AF]">{parent.event_notice_number ? `#${parent.event_notice_number}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#9CA3AF] mb-0.5">{parentDateLabel}</p>
                      <p className="text-sm text-[#9CA3AF]">{parentNoticeDate ?? "—"}</p>
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
        <Modal title={`Edit — ${getEventLabel(editEventCategory, editEventDetails)}`} onClose={() => setEditEvent(null)} isDirty={editEventIsDirty}>
          <form onSubmit={handleSaveEvent} className="space-y-5">
            {/* Category (read-only display, can't change category as it would break field semantics) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280] font-medium">Category:</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-[#4A6FA5]">
                {getEventLabel(editEventCategory, editEventDetails)}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${editEventType === "sub" ? "bg-purple-50 text-purple-700" : "bg-[#EEF2FF] text-[#4A6FA5]"}`}>
                {editEventType === "sub" ? "Sub Event" : "Main Event"}
              </span>
            </div>

            {/* Category Name — shown only when category is Others */}
            {(editEventCategory === "others" || editEventCategory === "others_sub") && (
              <Field label="Category Name *">
                <input
                  type="text"
                  value={editEventDetails["category_name"] ?? ""}
                  onChange={(e) => setEditDetail("category_name", e.target.value)}
                  placeholder="Enter category name…"
                  className={inp}
                />
              </Field>
            )}

            {/* Order Number — main events only */}
            {editEventType === "main" && (
              <Field label="Order Number">
                <input type="text" value={editEventNoticeNumber} onChange={(e) => setEditEventNoticeNumber(e.target.value)} className={inp} />
              </Field>
            )}

            {/* Parent Main Event selector — sub events only */}
            {editEventType === "sub" && (() => {
              const proc = (appeal.proceedings ?? []).find(p => p.id === editEventProceedingId);
              const mainEvents = [...(proc?.events ?? [])]
                .filter(e => e.event_type === "main" && !e.deleted_at)
                .sort((a, b) => a.created_at.localeCompare(b.created_at));
              const selectedParent = editEventParentId ? allEventsById[editEventParentId] : null;
              const parentDateField = selectedParent ? PARENT_DATE_FIELD[selectedParent.category] : null;
              const parentDateKey = parentDateField?.key ?? null;
              const parentDateLabel = parentDateField?.label ?? "Date";
              const parentNoticeDate = selectedParent && parentDateKey && selectedParent.details?.[parentDateKey]
                ? selectedParent.details[parentDateKey]
                : selectedParent?.event_date ?? "";
              return (
                <div className="space-y-3">
                  <Field label="Parent Main Event">
                    <select
                      value={editEventParentId ?? ""}
                      onChange={(e) => setEditEventParentId(e.target.value || null)}
                      className={inp}
                    >
                      <option value="">— None (unlinked) —</option>
                      {mainEvents.map((m, mIdx) => (
                        <option key={m.id} value={m.id}>
                          #{mIdx + 1} — {getEventLabel(m.category, m.details)}
                          {m.event_notice_number ? ` (Order #${m.event_notice_number})` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedParent && (
                    <div className="rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] px-4 py-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Order No.</label>
                          <input readOnly value={selectedParent.event_notice_number ?? ""} placeholder="—"
                            className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-[#F3F4F6] border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280] mb-1.5">{parentDateLabel}</label>
                          <input readOnly value={parentNoticeDate ? parentNoticeDate.slice(0, 10) : ""} placeholder="—" type="date"
                            className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-[#F3F4F6] border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                          .filter((m) => m.parent_id === appeal.act_regulation?.id)
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

            {/* Status */}
            <Field label="Status">
              <select value={editEventStatus} onChange={(e) => setEditEventStatus(e.target.value)} className={inp}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="closed">Closed</option>
              </select>
            </Field>

            {editEventError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{editEventError}</div>}

            <div className="border-t border-[#E5E7EB] -mx-6 px-6 pt-4">
              <EventAttachments eventId={editEvent.id} docs={editEvent.event_documents ?? []} canEdit={canEdit} />
            </div>

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
        <Modal
          title={addEventParentId ? "Add Sub Event" : "Add Main Event"}
          onClose={() => { setAddEventProcId(null); setAddEventParentId(null); setAddEventPendingFiles([]); }}
          isDirty={addEventIsDirty}
        >
          <form onSubmit={handleAddEvent} className="space-y-4">
            {/* Type badge (read-only) */}
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${addEventParentId ? "bg-purple-50 text-purple-700" : "bg-[#EEF2FF] text-[#4A6FA5]"}`}>
                {addEventParentId ? "Sub Event" : "Main Event"}
              </span>
            </div>

            {/* Inherited from parent main event (sub events only) */}
            {addEventParentId && (() => {
              const parent = allEventsById[addEventParentId];
              if (!parent) return null;
              const parentDateField = PARENT_DATE_FIELD[parent.category];
              const parentDateKey = parentDateField?.key;
              const parentDateLabel = parentDateField?.label ?? "Date";
              const parentNoticeDate = parentDateKey && parent.details?.[parentDateKey] ? parent.details[parentDateKey] : parent.event_date ?? "";
              return (
                <div className="rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] px-4 py-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Order No.</label>
                      <input readOnly value={parent.event_notice_number ?? ""} placeholder="—"
                        className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-[#F3F4F6] border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6B7280] mb-1.5">{parentDateLabel}</label>
                      <input readOnly value={parentNoticeDate ? parentNoticeDate.slice(0, 10) : ""} placeholder="—" type="date"
                        className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-[#F3F4F6] border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Category */}
            <Field label="Category *">
              <select value={eventCategory} onChange={(e) => handleEventCategoryChange(e.target.value)} className={inp}>
                <option value="">Select category…</option>
                {Object.entries(addEventParentId ? SUB_EVENT_LABELS : MAIN_EVENT_LABELS)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
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

            {/* Order Number — main events only */}
            {!addEventParentId && (
              <Field label="Order Number">
                <input type="text" value={eventNoticeNumber} onChange={(e) => setEventNoticeNumber(e.target.value)} className={inp} />
              </Field>
            )}

            {/* Dynamic category fields */}
            {eventCategory && CATEGORY_FIELDS[eventCategory] && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[#F3F4F6]">
                {CATEGORY_FIELDS[eventCategory].map((field) => (
                  <Field key={field.key} label={field.label} fullWidth={field.fullWidth}>
                    {field.type === "datetime" && (
                      <DateTimeField value={eventDetails[field.key] ?? ""} onChange={(v) => setDetail(field.key, v)} />
                    )}
                    {field.type === "text" && (
                      <input type="text" value={eventDetails[field.key] ?? ""} onChange={(e) => setDetail(field.key, e.target.value)} className={inp} />
                    )}
                    {field.type === "select" && (
                      <select value={eventDetails[field.key] ?? ""} onChange={(e) => setDetail(field.key, e.target.value)} className={inp}>
                        <option value="">Select…</option>
                        {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                    {field.type === "proceeding_select" && (
                      <select value={eventDetails[field.key] ?? ""} onChange={(e) => setDetail(field.key, e.target.value)} className={inp}>
                        <option value="">Select…</option>
                        {[...(mastersByType["proceeding_type"] ?? [])]
                          .filter((m) => m.parent_id === appeal.act_regulation?.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </Field>
                ))}
              </div>
            )}

            {/* Status */}
            <Field label="Status">
              <select value={eventStatus} onChange={(e) => setEventStatus(e.target.value)} className={inp}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="closed">Closed</option>
              </select>
            </Field>

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} rows={2} placeholder="Any additional notes…" className={`${inp} resize-none`} />
            </Field>

            {/* Attachments */}
            <PendingAttachments files={addEventPendingFiles} onChange={setAddEventPendingFiles} />

            {eventError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{eventError}</div>}

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => { setAddEventProcId(null); setAddEventParentId(null); setAddEventPendingFiles([]); }}
                className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button type="submit" disabled={eventSaving}
                className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                {eventSaving ? "Adding…" : (addEventParentId ? "Add Sub Event" : "Add Main Event")}
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
