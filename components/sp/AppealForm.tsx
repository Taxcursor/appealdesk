"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAppeal, uploadProceedingDocument, AppealInput, ProceedingInput } from "@/app/(sp)/litigations/actions";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
import { createClient } from "@/lib/supabase/client";
import { PendingAttachments } from "@/components/sp/PendingAttachments";

/** Derives AY name from FY name: "2020-21" → "2021-22" */
function deriveAYName(fyName: string): string {
  const match = fyName.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const ayStart = parseInt(match[1]) + 1;
  const ayEnd = (parseInt(match[2]) + 1).toString().padStart(2, "0");
  return `${ayStart}-${ayEnd}`;
}

/** AY is disabled for FY 2026-27 and beyond (start year ≥ 2026) */
function isAYDisabled(fyName: string): boolean {
  const match = fyName.match(/^(\d{4})/);
  return !!match && parseInt(match[1]) >= 2026;
}

/** Filter FY options based on selected act */
function filterFYForAct(fyOptions: MasterItem[], actName: string | undefined): MasterItem[] {
  if (actName === "The Income-tax Act, 1961") {
    return fyOptions.filter(m => { const y = parseInt(m.name); return isNaN(y) || parseInt(m.name.slice(0, 4)) < 2026; });
  }
  if (actName === "The Income-tax Act, 2025") {
    return fyOptions.filter(m => { const y = parseInt(m.name.slice(0, 4)); return !isNaN(y) && y >= 2026; });
  }
  return fyOptions;
}

type MasterItem = { id: string; name: string; type: string; parent_id: string | null };

interface Props {
  clients: { id: string; name: string }[];
  teamMembers: { id: string; first_name: string; last_name: string }[];
  mastersByType: Record<string, MasterItem[]>;
  clientUsersByOrg: Record<string, { id: string; first_name: string; last_name: string }[]>;
}

const inp = "w-full px-3 py-2 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";

function MultiSelect({ options, selected, onChange, placeholder, disabled }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  }
  const selectedLabels = options.filter(o => selected.includes(o.value)).map(o => o.label);
  return (
    <div className="relative">
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        className={`${inp} flex items-center justify-between gap-2 min-h-10.5 flex-wrap ${disabled ? "opacity-50 cursor-not-allowed bg-surface-hover" : "cursor-pointer"}`}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-muted text-sm">{placeholder ?? "Select…"}</span>
        ) : (
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedLabels.map((label, i) => (
              <span key={i} className="inline-flex px-2 py-0.5 bg-accent-light text-accent rounded text-xs font-medium">{label}</span>
            ))}
          </div>
        )}
        <svg className={`w-4 h-4 shrink-0 text-secondary transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No options available</div>
            ) : options.map(opt => (
              <div key={opt.value} onClick={() => toggle(opt.value)} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover cursor-pointer">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.includes(opt.value) ? "bg-primary border-primary" : "border-border-strong"}`}>
                  {selected.includes(opt.value) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  )}
                </div>
                <span className="text-sm text-heading">{opt.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function AppealForm({ clients, teamMembers, mastersByType, clientUsersByOrg }: Props) {
  const router = useRouter();

  // All master-linked fields store UUIDs (master_records.id)
  const [clientOrgId, setClientOrgId] = useState("");
  const [financialYearId, setFinancialYearId] = useState("");
  const [assessmentYearId, setAssessmentYearId] = useState("");
  const [actRegulationId, setActRegulationId] = useState("");
  const [appealStatus, setAppealStatus] = useState("open");

  const [proceedingTypeId, setProceedingTypeId] = useState("");
  const [authorityType, setAuthorityType] = useState("");
  const [authorityName, setAuthorityName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [jurisdictionCity, setJurisdictionCity] = useState("");
  const [importance, setImportance] = useState("");
  const [mode, setMode] = useState("");
  const [initiatedOn, setInitiatedOn] = useState("");
  const [toBeCompletedBy, setToBeCompletedBy] = useState("");
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [clientStaffIds, setClientStaffIds] = useState<string[]>([]);
  const [possibleOutcome, setPossibleOutcome] = useState("");
  const [proceedingStatus, setProceedingStatus] = useState("open");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; desc: string }[]>([]);

  // Derive selected act name
  const selectedAct = (mastersByType["act_regulation"] ?? []).find(m => m.id === actRegulationId);
  const actName = selectedAct?.name;
  const isITAct1961 = actName === "The Income-tax Act, 1961";
  const isITAct2025 = actName === "The Income-tax Act, 2025";
  const hideAY = !!(actName?.includes("Income-tax Act, 2025") || actName?.toLowerCase().includes("central goods"));

  // AY only available for IT Act 1961, and only for FY up to 2025-26
  const selectedFY = (mastersByType["financial_year"] ?? []).find(m => m.id === financialYearId);
  const fyName = selectedFY?.name ?? "";
  const ayDisabled = !isITAct1961 || (fyName ? isAYDisabled(fyName) : false);

  // FY options filtered by act
  const availableFYOptions = filterFYForAct(mastersByType["financial_year"] ?? [], actName);

  // Proceedings filtered to children of the selected act
  const availableProceedings = actRegulationId
    ? (mastersByType["proceeding_type"] ?? []).filter(m => m.parent_id === actRegulationId)
    : [];

  function handleActChange(actId: string) {
    setActRegulationId(actId);
    setProceedingTypeId("");
    setFinancialYearId("");
    setAssessmentYearId("");
  }

  function handleFYChange(fyId: string) {
    setFinancialYearId(fyId);
    if (!fyId || !isITAct1961) { setAssessmentYearId(""); return; }
    const fy = (mastersByType["financial_year"] ?? []).find(m => m.id === fyId);
    if (!fy || isAYDisabled(fy.name)) { setAssessmentYearId(""); return; }
    const derivedName = deriveAYName(fy.name);
    const ayItem = (mastersByType["assessment_year"] ?? []).find(m => m.name === derivedName);
    setAssessmentYearId(ayItem?.id ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientOrgId) { setError("Client is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const appeal: AppealInput = {
        client_org_id: clientOrgId,
        financial_year_id: financialYearId || undefined,
        assessment_year_id: assessmentYearId || undefined,
        act_regulation_id: actRegulationId || undefined,
        status: appealStatus,
      };
      const proc: ProceedingInput = {
        proceeding_type_id: proceedingTypeId || undefined,
        authority_type: authorityType,
        authority_name: authorityName,
        jurisdiction,
        jurisdiction_city: jurisdictionCity,
        importance,
        mode,
        initiated_on: initiatedOn,
        to_be_completed_by: toBeCompletedBy,
        assigned_to_ids: assignedToIds,
        client_staff_ids: clientStaffIds,
        possible_outcome: possibleOutcome,
        status: proceedingStatus,
      };
      const { appealId, proceedingId } = await createAppeal(appeal, proc);
      if (pendingFiles.length > 0) {
        const supabase = createClient();
        for (const { file, desc } of pendingFiles) {
          const path = `proceeding-docs/${proceedingId}/${Date.now()}-${sanitizeFileName(file.name)}`;
          const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
          if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
          const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
          await uploadProceedingDocument(proceedingId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        }
      }
      router.push(`/litigations/${appealId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create litigation.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1 */}
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading pb-3 border-b border-border mb-5">Litigation Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Client Organisation" required>
              <select value={clientOrgId} onChange={(e) => setClientOrgId(e.target.value)} className={inp}>
                <option value="">Select client…</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Act / Regulation">
              <select value={actRegulationId} onChange={(e) => handleActChange(e.target.value)} className={inp}>
                <option value="">Select…</option>
                {[...(mastersByType["act_regulation"] ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          </div>
          <div className={hideAY ? "col-span-2" : ""}>
            <Field label={isITAct2025 ? "Tax Year" : "Financial Year / Tax Year"}>
              <select value={financialYearId} onChange={(e) => handleFYChange(e.target.value)} className={inp} disabled={!actRegulationId}>
                <option value="">{actRegulationId ? "Select…" : "Select Act first"}</option>
                {[...availableFYOptions].sort((a, b) => b.name.localeCompare(a.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          </div>
          {!hideAY && (
            <Field label="Assessment Year">
              <div className="w-full px-3 py-2 text-sm border-2 rounded-lg bg-surface-hover border-border text-secondary cursor-not-allowed">
                {ayDisabled
                  ? "Not applicable"
                  : (mastersByType["assessment_year"] ?? []).find(m => m.id === assessmentYearId)?.name ?? "—"}
              </div>
            </Field>
          )}
          <Field label="Status">
            <select value={appealStatus} onChange={(e) => setAppealStatus(e.target.value)} className={inp}>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
        </div>
      </section>

      {/* Section 2 */}
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading pb-3 border-b border-border mb-5">Proceeding</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Proceeding${actRegulationId ? "" : " (select Act first)"}`}>
            <select value={proceedingTypeId} onChange={(e) => setProceedingTypeId(e.target.value)} className={inp} disabled={!actRegulationId}>
              <option value="">{actRegulationId ? "Select proceeding…" : "Select Act / Regulation first"}</option>
              {[...availableProceedings].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Jurisdiction">
            <input value={authorityType} onChange={(e) => setAuthorityType(e.target.value)} className={inp} />
          </Field>
          <Field label="Authority Name">
            <input value={authorityName} onChange={(e) => setAuthorityName(e.target.value)} placeholder="e.g. ACIT, Circle 1(1)" className={inp} />
          </Field>
          <Field label="Jurisdiction City">
            <input value={jurisdictionCity} onChange={(e) => setJurisdictionCity(e.target.value)} placeholder="e.g. Chennai" className={inp} />
          </Field>
          <div className="col-span-2">
            <Field label="Jurisdiction / Address">
              <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="Full jurisdiction or address" className={inp} />
            </Field>
          </div>
          <Field label="Importance">
            <select value={importance} onChange={(e) => setImportance(e.target.value)} className={inp}>
              <option value="">Select…</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <Field label="Mode">
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inp}>
              <option value="">Select…</option>
              <option value="online">Online</option>
              <option value="offline">Offline / Physical</option>
            </select>
          </Field>
          <Field label="Initiated On">
            <input type="date" value={initiatedOn} onChange={(e) => setInitiatedOn(e.target.value)} className={inp} />
          </Field>
          <Field label="Limitation Date">
            <input type="date" value={toBeCompletedBy} onChange={(e) => setToBeCompletedBy(e.target.value)} className={inp} />
          </Field>
          <Field label="Assigned To">
            <MultiSelect
              options={[...teamMembers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(m => ({ value: m.id, label: `${m.first_name} ${m.last_name}` }))}
              selected={assignedToIds}
              onChange={setAssignedToIds}
              placeholder="Unassigned"
            />
          </Field>
          <Field label="Client Staff">
            <MultiSelect
              options={[...(clientUsersByOrg[clientOrgId] ?? [])].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` }))}
              selected={clientStaffIds}
              onChange={setClientStaffIds}
              placeholder={clientOrgId ? "None" : "Select client first"}
              disabled={!clientOrgId}
            />
          </Field>
          <Field label="Possible Outcome">
            <select value={possibleOutcome} onChange={(e) => setPossibleOutcome(e.target.value)} className={inp}>
              <option value="">Select…</option>
              <option value="doubtful">Doubtful</option>
              <option value="favourable">Favourable</option>
              <option value="unfavourable">Unfavourable</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={proceedingStatus} onChange={(e) => setProceedingStatus(e.target.value)} className={inp}>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
        </div>

        {/* Attachments */}
        <div className="border-t border-border mt-4 pt-4">
          <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />
        </div>
      </section>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.push("/litigations")}
          className="px-5 py-2.5 text-sm border border-border rounded-lg text-heading hover:bg-page transition">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60">
          {saving ? "Creating…" : "Create Litigation"}
        </button>
      </div>
    </form>
  );
}
