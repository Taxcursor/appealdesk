"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  updateProceeding,
  deleteProceeding,
  addEvent,
  updateEvent,
  deleteEvent,
  ProceedingInput,
} from "@/app/(sp)/litigations/actions";
import { GuestAttachments, AttachedFile } from "@/components/sp/GuestAttachments";

export interface GuestProceedingSummary {
  id: string;
  status: string;
  authority_type: string | null;
  authority_name: string | null;
  jurisdiction: string | null;
  jurisdiction_city: string | null;
  importance: string | null;
  mode: string | null;
  initiated_on: string | null;
  to_be_completed_by: string | null;
  possible_outcome: string | null;
  proceeding_type: { id: string; name: string } | null;
  appeal: {
    id: string;
    status: string;
    client_org: { id: string; name: string } | null;
    act_regulation: { id: string; name: string } | null;
    financial_year: { id: string; name: string } | null;
    assessment_year: { id: string; name: string } | null;
    litigation_type: { id: string; name: string } | null;
  } | null;
}

interface EventRow {
  id: string;
  category: string;
  event_date: string | null;
  event_notice_number: string | null;
  description: string | null;
  status: string;
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
};

const IMPORTANCE: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-white text-red-700" },
  high: { label: "High", cls: "bg-white text-orange-700" },
  medium: { label: "Medium", cls: "bg-white text-yellow-700" },
  low: { label: "Low", cls: "bg-white text-green-700" },
};
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-white text-blue-700" },
  closed: { label: "Closed", cls: "bg-white text-gray-500" },
};

const inp = "w-full px-2.5 py-1.5 text-xs border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs mb-0.5 text-muted">{label}</p>
      <p className="text-sm text-heading">{value || "—"}</p>
    </div>
  );
}

export default function GuestProceedingCard({
  proceeding,
  canEdit,
  expanded,
  onToggle,
}: {
  proceeding: GuestProceedingSummary;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    authority_type: proceeding.authority_type ?? "",
    authority_name: proceeding.authority_name ?? "",
    jurisdiction: proceeding.jurisdiction ?? "",
    jurisdiction_city: proceeding.jurisdiction_city ?? "",
    importance: proceeding.importance ?? "",
    mode: proceeding.mode ?? "",
    initiated_on: proceeding.initiated_on ?? "",
    to_be_completed_by: proceeding.to_be_completed_by ?? "",
    possible_outcome: proceeding.possible_outcome ?? "",
    status: proceeding.status ?? "open",
  });

  const [events, setEvents] = useState<EventRow[]>([]);
  const [procDocs, setProcDocs] = useState<AttachedFile[]>([]);
  const [eventDocs, setEventDocs] = useState<Record<string, AttachedFile[]>>({});
  const [loaded, setLoaded] = useState(false);

  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    category: "notice_from_authority",
    event_date: "",
    event_notice_number: "",
    description: "",
  });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [confirmDeleteProceeding, setConfirmDeleteProceeding] = useState(false);
  const router = useRouter();

  async function loadDetail() {
    const supabase = createClient();
    const { data: evts } = await supabase
      .from("events")
      .select("id, category, event_date, event_notice_number, description, status")
      .eq("proceeding_id", proceeding.id)
      .is("deleted_at", null)
      .eq("event_type", "main")
      .order("event_date", { ascending: true, nullsFirst: false });
    const eventRows = (evts ?? []) as EventRow[];
    setEvents(eventRows);

    const { data: pDocs } = await createClient()
      .from("proceeding_documents")
      .select("id, file_name, file_url, file_size, description, created_at")
      .eq("proceeding_id", proceeding.id)
      .is("deleted_at", null);
    setProcDocs((pDocs ?? []) as AttachedFile[]);

    if (eventRows.length > 0) {
      const { data: eDocs } = await supabase
        .from("event_documents")
        .select("id, event_id, file_name, file_url, file_size, description, created_at")
        .in("event_id", eventRows.map((e) => e.id))
        .is("deleted_at", null);
      const grouped: Record<string, AttachedFile[]> = {};
      ((eDocs ?? []) as (AttachedFile & { event_id: string })[]).forEach((d) => {
        if (!grouped[d.event_id]) grouped[d.event_id] = [];
        grouped[d.event_id].push(d);
      });
      setEventDocs(grouped);
    }
    setLoaded(true);
  }

  useEffect(() => {
    if (expanded && !loaded) loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function refresh() {
    setLoaded(false);
    await loadDetail();
  }

  async function handleSaveProceeding() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      // Fetch the full current row so fields this form doesn't expose
      // (assigned_to_ids, client_staff_ids, guest_ids, proceeding_type_id,
      // etc.) are preserved rather than wiped by the update.
      const { data: full } = await supabase.from("proceedings").select("*").eq("id", proceeding.id).single();
      if (!full) throw new Error("Proceeding not found.");

      const payload: ProceedingInput = {
        proceeding_type_id: full.proceeding_type_id ?? undefined,
        authority_type: form.authority_type || undefined,
        authority_name: form.authority_name || undefined,
        jurisdiction: form.jurisdiction || undefined,
        jurisdiction_city: form.jurisdiction_city || undefined,
        importance: form.importance || undefined,
        mode: form.mode || undefined,
        initiated_on: form.initiated_on || undefined,
        to_be_completed_by: form.to_be_completed_by || undefined,
        assigned_to_ids: full.assigned_to_ids ?? [],
        client_staff_ids: full.client_staff_ids ?? [],
        guest_ids: full.guest_ids ?? [],
        possible_outcome: form.possible_outcome || undefined,
        status: form.status || undefined,
        gst_number: full.gst_number ?? undefined,
        contacts: full.contacts ?? [],
      };
      await updateProceeding(proceeding.id, payload);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProceeding() {
    setSaving(true);
    try {
      await deleteProceeding(proceeding.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete proceeding.");
      setSaving(false);
      setConfirmDeleteProceeding(false);
    }
  }

  async function handleSaveEvent() {
    setSaving(true);
    setError(null);
    try {
      if (editingEventId) {
        await updateEvent(editingEventId, {
          proceeding_id: proceeding.id,
          event_type: "main",
          category: eventForm.category,
          event_date: eventForm.event_date || undefined,
          event_notice_number: eventForm.event_notice_number || undefined,
          description: eventForm.description || undefined,
        });
      } else {
        await addEvent({
          proceeding_id: proceeding.id,
          event_type: "main",
          category: eventForm.category,
          event_date: eventForm.event_date || undefined,
          event_notice_number: eventForm.event_notice_number || undefined,
          description: eventForm.description || undefined,
        });
      }
      setShowAddEvent(false);
      setEditingEventId(null);
      setEventForm({ category: "notice_from_authority", event_date: "", event_notice_number: "", description: "" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent() {
    if (!confirmDeleteEventId) return;
    setSaving(true);
    try {
      await deleteEvent(confirmDeleteEventId);
      setConfirmDeleteEventId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event.");
    } finally {
      setSaving(false);
    }
  }

  const impCfg = proceeding.importance ? IMPORTANCE[proceeding.importance] : null;
  const statusCfg = STATUS_CFG[proceeding.status ?? "open"];

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Collapsed summary row — matches staff proceeding card header style */}
      <div
        className="grid items-center bg-[#696969] hover:bg-[#595959] transition-colors cursor-pointer select-none overflow-hidden"
        style={{ gridTemplateColumns: "1fr 124px 112px 128px auto" }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 px-5 py-4 min-w-0">
          <svg
            className={`w-4 h-4 shrink-0 text-white/60 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-white text-sm truncate">
            {proceeding.proceeding_type?.name ?? "Proceeding"}
          </span>
        </div>
        <div className="px-2 py-4">
          {impCfg && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${impCfg.cls}`}>{impCfg.label}</span>
          )}
        </div>
        <div className="px-2 py-4">
          {statusCfg && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
          )}
        </div>
        <div className="px-2 py-4 text-white/80 text-xs">
          Due: {fmtDate(proceeding.to_be_completed_by)}
        </div>
        <div className="px-5 py-4" />
      </div>

      {expanded && (
        <div className="p-5 space-y-5">
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Proceeding Details</p>
              {canEdit && !editing && (
                <button onClick={() => setEditing(true)} className="text-xs text-primary font-medium hover:underline">Edit</button>
              )}
            </div>

            {!editing ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                <DetailRow label="Jurisdiction" value={proceeding.authority_type} />
                <DetailRow label="Authority Name" value={proceeding.authority_name} />
                <DetailRow label="Jurisdiction City" value={proceeding.jurisdiction_city} />
                <DetailRow label="Jurisdiction / Address" value={proceeding.jurisdiction} />
                <DetailRow label="Mode" value={proceeding.mode && <span className="capitalize">{proceeding.mode}</span>} />
                <DetailRow label="Initiated On" value={fmtDate(proceeding.initiated_on)} />
                <DetailRow label="Limitation Date" value={fmtDate(proceeding.to_be_completed_by)} />
                <DetailRow label="Possible Outcome" value={proceeding.possible_outcome && <span className="capitalize">{proceeding.possible_outcome}</span>} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-secondary mb-1">Jurisdiction</label>
                  <input className={inp} value={form.authority_type} onChange={(e) => setForm({ ...form, authority_type: e.target.value })} /></div>
                <div><label className="block text-xs text-secondary mb-1">Authority Name</label>
                  <input className={inp} value={form.authority_name} onChange={(e) => setForm({ ...form, authority_name: e.target.value })} /></div>
                <div><label className="block text-xs text-secondary mb-1">Jurisdiction City</label>
                  <input className={inp} value={form.jurisdiction_city} onChange={(e) => setForm({ ...form, jurisdiction_city: e.target.value })} /></div>
                <div><label className="block text-xs text-secondary mb-1">Jurisdiction / Address</label>
                  <input className={inp} value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} /></div>
                <div><label className="block text-xs text-secondary mb-1">Importance</label>
                  <select className={inp} value={form.importance} onChange={(e) => setForm({ ...form, importance: e.target.value })}>
                    <option value="">Select…</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select></div>
                <div><label className="block text-xs text-secondary mb-1">Mode</label>
                  <select className={inp} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                    <option value="">Select…</option>
                    <option value="faceless">Faceless</option>
                    <option value="jurisdictional">Jurisdictional</option>
                    <option value="both">Both</option>
                  </select></div>
                <div><label className="block text-xs text-secondary mb-1">Initiated On</label>
                  <input type="date" className={inp} value={form.initiated_on} onChange={(e) => setForm({ ...form, initiated_on: e.target.value })} /></div>
                <div><label className="block text-xs text-secondary mb-1">Limitation Date</label>
                  <input type="date" className={inp} value={form.to_be_completed_by} onChange={(e) => setForm({ ...form, to_be_completed_by: e.target.value })} /></div>
                <div><label className="block text-xs text-secondary mb-1">Possible Outcome</label>
                  <select className={inp} value={form.possible_outcome} onChange={(e) => setForm({ ...form, possible_outcome: e.target.value })}>
                    <option value="">Select…</option>
                    <option value="favourable">Favourable</option>
                    <option value="doubtful">Doubtful</option>
                    <option value="unfavourable">Unfavourable</option>
                  </select></div>
                <div><label className="block text-xs text-secondary mb-1">Status</label>
                  <select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select></div>
                <div className="col-span-2 flex gap-2 pt-1">
                  <button onClick={handleSaveProceeding} disabled={saving}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium disabled:opacity-60">
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={() => setEditing(false)} disabled={saving}
                    className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:bg-page">Cancel</button>
                </div>
              </div>
            )}
          </div>

          <GuestAttachments scope="proceeding" entityId={proceeding.id} docs={procDocs} canEdit={canEdit} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Events</p>
              {canEdit && (
                <button
                  onClick={() => {
                    setShowAddEvent(true);
                    setEditingEventId(null);
                    setEventForm({ category: "notice_from_authority", event_date: "", event_notice_number: "", description: "" });
                  }}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  + Add Event
                </button>
              )}
            </div>

            {!loaded ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : events.length === 0 && !showAddEvent ? (
              <p className="text-xs text-muted">No events yet.</p>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-heading">{EVENT_CATEGORY_LABELS[ev.category] ?? ev.category}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {fmtDate(ev.event_date)}
                          {ev.event_notice_number ? ` · Notice #${ev.event_notice_number}` : ""}
                          {" · "}<span className="capitalize">{ev.status}</span>
                        </p>
                        {ev.description && <p className="text-xs text-secondary mt-1">{ev.description}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingEventId(ev.id);
                              setShowAddEvent(true);
                              setEventForm({
                                category: ev.category,
                                event_date: ev.event_date ?? "",
                                event_notice_number: ev.event_notice_number ?? "",
                                description: ev.description ?? "",
                              });
                            }}
                            className="p-1.5 rounded hover:bg-surface-hover text-secondary transition-colors"
                            title="Edit event"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmDeleteEventId(ev.id)}
                            className="p-1.5 rounded hover:bg-surface-hover text-red-400 hover:text-red-600 transition-colors"
                            title="Delete event"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <GuestAttachments scope="event" entityId={ev.id} docs={eventDocs[ev.id] ?? []} canEdit={canEdit} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddEvent && canEdit && (
              <div className="mt-3 border border-border rounded-lg p-3 bg-page space-y-3">
                <p className="text-xs font-semibold text-secondary">{editingEventId ? "Edit Event" : "New Event"}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-secondary mb-1">Category</label>
                    <select className={inp} value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}>
                      {Object.entries(EVENT_CATEGORY_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select></div>
                  <div><label className="block text-xs text-secondary mb-1">Date</label>
                    <input type="date" className={inp} value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /></div>
                  <div><label className="block text-xs text-secondary mb-1">Notice Number</label>
                    <input className={inp} value={eventForm.event_notice_number} onChange={(e) => setEventForm({ ...eventForm, event_notice_number: e.target.value })} /></div>
                  <div className="col-span-2"><label className="block text-xs text-secondary mb-1">Description</label>
                    <textarea className={inp} rows={2} value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} /></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveEvent} disabled={saving}
                    className="px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg font-medium disabled:opacity-60">
                    {saving ? "Saving…" : "Save Event"}
                  </button>
                  <button onClick={() => { setShowAddEvent(false); setEditingEventId(null); }} disabled={saving}
                    className="px-3 py-1.5 text-xs border border-border rounded-lg text-secondary hover:bg-white">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="pt-2 border-t border-border">
              <button onClick={() => setConfirmDeleteProceeding(true)} className="text-xs text-red-600 hover:underline font-medium">
                Delete this proceeding
              </button>
            </div>
          )}
        </div>
      )}

      {confirmDeleteEventId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Event?</h3>
            <p className="text-sm text-secondary mb-5">This will permanently delete the event and its documents.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteEventId(null)} disabled={saving}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page">Cancel</button>
              <button onClick={handleDeleteEvent} disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-60">
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteProceeding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Proceeding?</h3>
            <p className="text-sm text-secondary mb-5">This will permanently delete this proceeding, its events, and its documents. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteProceeding(false)} disabled={saving}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page">Cancel</button>
              <button onClick={handleDeleteProceeding} disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-60">
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
