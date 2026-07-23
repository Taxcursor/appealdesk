"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toggleClientStatus, deleteClient } from "@/app/(sp)/clients/actions";
import SplitImportButton from "@/components/sp/SplitImportButton";

interface ComplianceDetail {
  type: string;
  number: string | null;
}

interface Client {
  id: string;
  name: string;
  business_type?: string;
  city?: string;
  is_active: boolean;
  created_at: string;
  date_of_incorporation?: string | null;
  file_number?: string | null;
  compliance_details?: ComplianceDetail[];
}

interface NamedRecord {
  id: string;
  name: string;
}

// ─── Column visibility ────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: "file_no",              label: "File No."              },
  { key: "business_type",        label: "Business Type"         },
  { key: "pan",                  label: "PAN"                   },
  { key: "date_of_incorporation", label: "Date of Incorporation" },
] as const;

type ColKey = (typeof ALL_COLUMNS)[number]["key"];
const ALL_COL_KEYS = ALL_COLUMNS.map(c => c.key) as ColKey[];

function storageKey(userId: string) { return `appealdesk_client_col_vis_${userId}`; }

interface Props {
  clients: Client[];
  isAdmin: boolean;
  currentClientIds: string[];
  currentBtypes: string[];
  currentCities: string[];
  currentStatuses: string[];
  currentSortDir: string;
  userId: string;
  businessTypes?: string[];
}

const STATUS_OPTIONS: NamedRecord[] = [
  { id: "active",   name: "Active" },
  { id: "inactive", name: "Inactive" },
];

function MultiSelect({
  options, values, onChange, placeholder, searchable = true,
}: {
  options: NamedRecord[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  searchable?: boolean;
}) {
  const [open, setOpen]       = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [query, setQuery]     = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const pendingRef   = useRef<string[]>([]);

  function openDropdown() {
    const copy = [...values];
    setPending(copy);
    pendingRef.current = copy;
    setQuery("");
    setOpen(true);
    if (searchable) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function applyAndClose() {
    onChange(pendingRef.current);
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) applyAndClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setPending((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      pendingRef.current = next;
      return next;
    });
  }

  const filtered = searchable && query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  let triggerText: string;
  if (values.length === 0)      triggerText = placeholder;
  else if (values.length === 1) triggerText = options.find((o) => o.id === values[0])?.name ?? "1 selected";
  else                          triggerText = `${values.length} selected`;

  const hasValue = values.length > 0;
  const isMulti  = values.length > 1;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-white cursor-pointer min-w-[200px] max-w-[260px] h-[38px] select-none"
        onClick={() => (open ? applyAndClose() : openDropdown())}
      >
        <span className={`flex-1 truncate ${!hasValue ? "text-muted" : isMulti ? "font-medium text-primary" : "text-heading"}`} title={triggerText}>
          {triggerText}
        </span>
        {hasValue ? (
          <button onMouseDown={(e) => { e.stopPropagation(); onChange([]); }} className="text-muted hover:text-heading shrink-0 text-base leading-none">×</button>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-50 w-60 max-h-64 flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-border shrink-0">
              <input ref={inputRef} className="w-full px-2 py-1.5 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {pending.length > 0 && (
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between shrink-0">
              <span className="text-xs text-muted">{pending.length} selected</span>
              <button onMouseDown={(e) => { e.preventDefault(); setPending([]); pendingRef.current = []; }} className="text-xs text-accent hover:underline">Clear</button>
            </div>
          )}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">No matches</div>
            ) : (
              filtered.map((o) => {
                const isChecked = pending.includes(o.id);
                return (
                  <button key={o.id} onMouseDown={(e) => { e.preventDefault(); toggle(o.id); }} className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-page ${isChecked ? "bg-accent-light" : ""}`}>
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isChecked ? "bg-primary border-primary" : "border-border-strong"}`}>
                      {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isChecked ? "font-medium text-heading" : "text-secondary"}`} title={o.name}>{o.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientsClient({
  clients, isAdmin,
  currentClientIds, currentBtypes, currentCities, currentStatuses, currentSortDir,
  userId, businessTypes,
}: Props) {
  const router = useRouter();
  const [loading,       setLoading]       = useState<string | null>(null);
  const [confirm,       setConfirm]       = useState<{ id: string; name: string; activate: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColKey> | null>(null);
  const effectiveCols = visibleCols ?? new Set<ColKey>(ALL_COL_KEYS);
  const col = (key: ColKey) => effectiveCols.has(key);
  const visibleColCount = 3 + effectiveCols.size; // Sl.No + Name (fixed) + visible + Actions

  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(userId));
      if (saved) {
        const parsed = JSON.parse(saved) as ColKey[];
        setVisibleCols(new Set(parsed.filter(k => ALL_COL_KEYS.includes(k))));
      } else {
        setVisibleCols(new Set(ALL_COL_KEYS));
      }
    } catch { setVisibleCols(new Set(ALL_COL_KEYS)); }
  }, [userId]);

  function toggleCol(key: ColKey) {
    setVisibleCols(prev => {
      const base = prev ?? new Set(ALL_COL_KEYS);
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(storageKey(userId), JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  }

  function resetCols() {
    setVisibleCols(new Set(ALL_COL_KEYS));
    try { localStorage.removeItem(storageKey(userId)); } catch { /* */ }
  }

  useEffect(() => {
    if (!colMenuOpen) return;
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colMenuOpen]);

  const clientOptions: NamedRecord[] = clients.map((c) => ({ id: c.id, name: c.name }));
  const btypeOptions: NamedRecord[]  = [...new Set(clients.map((c) => c.business_type).filter((v): v is string => !!v))].sort().map((v) => ({ id: v, name: v }));
  const cityOptions: NamedRecord[]   = [...new Set(clients.map((c) => c.city).filter((v): v is string => !!v))].sort().map((v) => ({ id: v, name: v }));

  const filtered = clients
    .filter((c) => {
      if (currentClientIds.length && !currentClientIds.includes(c.id))                              return false;
      if (currentBtypes.length    && !currentBtypes.includes(c.business_type ?? ""))                return false;
      if (currentCities.length    && !currentCities.includes(c.city ?? ""))                         return false;
      if (currentStatuses.length  && !currentStatuses.includes(c.is_active ? "active" : "inactive")) return false;
      return true;
    })
    .sort((a, b) =>
      currentSortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );

  const hasFilters = currentClientIds.length > 0 || currentBtypes.length > 0 || currentCities.length > 0 || currentStatuses.length > 0;

  function push(updates: Record<string, string>) {
    const merged: Record<string, string> = {
      name: currentClientIds.join(","), btype: currentBtypes.join(","),
      city: currentCities.join(","),    status: currentStatuses.join(","),
      sort_dir: currentSortDir, ...updates,
    };
    const p = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (!v) return;
      if (k === "sort_dir" && v === "asc") return;
      p.set(k, v);
    });
    router.push(`/clients${p.toString() ? `?${p.toString()}` : ""}`);
  }

  function setMultiFilter(key: string, ids: string[]) { push({ [key]: ids.join(",") }); }

  async function handleToggle() {
    if (!confirm) return;
    setLoading(confirm.id);
    try { await toggleClientStatus(confirm.id, confirm.activate); }
    finally { setLoading(null); setConfirm(null); }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteClient(deleteConfirm.id);
      window.location.href = "/clients";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete client.");
      setDeleting(false);
    }
  }

  const bannerWidth = "w-1/2";

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className={`bg-[#606060] rounded-xl px-5 py-1.5 ${bannerWidth}`}>
          <h1 className="text-2xl font-semibold text-white text-left">Clients</h1>
          <p className="text-white/60 text-sm mt-0.5 text-left">
            {hasFilters ? `${filtered.length} of ${clients.length}` : clients.length} client organizations
          </p>
        </div>
        {isAdmin && (
          <SplitImportButton addHref="/clients/new" addLabel="Add Client" importType="clients" businessTypes={businessTypes} />
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <MultiSelect options={clientOptions} values={currentClientIds} onChange={(ids) => setMultiFilter("name", ids)} placeholder="All Clients" />
        <MultiSelect options={btypeOptions}  values={currentBtypes}    onChange={(ids) => setMultiFilter("btype", ids)} placeholder="Business Type" />
        <MultiSelect options={cityOptions}   values={currentCities}    onChange={(ids) => setMultiFilter("city", ids)} placeholder="All Cities" />
        <MultiSelect options={STATUS_OPTIONS} values={currentStatuses} onChange={(ids) => setMultiFilter("status", ids)} placeholder="All Statuses" searchable={false} />

        <button onClick={() => push({ sort_dir: currentSortDir === "asc" ? "desc" : "asc" })} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-page transition text-heading">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {currentSortDir === "asc" ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
          {currentSortDir === "asc" ? "A → Z" : "Z → A"}
        </button>

        {hasFilters && (
          <button onClick={() => router.push("/clients")} className="px-3 py-2 text-sm text-muted hover:text-heading border border-border rounded-lg transition">Clear all</button>
        )}

        {/* Column settings */}
        <div ref={colMenuRef} className="relative ml-auto">
          <button
            onClick={() => setColMenuOpen(v => !v)}
            title="Column settings"
            className={`inline-flex items-center justify-center w-9.5 h-9.5 border rounded-lg hover:bg-page transition ${colMenuOpen ? "border-primary text-primary bg-accent-light" : "border-accent text-accent"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 w-52 py-2">
              <p className="px-3 pb-2 text-xs font-semibold text-heading border-b border-border mb-1">Column Visibility</p>
              {ALL_COLUMNS.map(({ key, label }) => {
                const checked = effectiveCols.has(key);
                return (
                  <label key={key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-page cursor-pointer select-none">
                    <div onClick={() => toggleCol(key)} className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors cursor-pointer ${checked ? "bg-primary border-primary" : "border-border-strong"}`}>
                      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span onClick={() => toggleCol(key)} className="text-sm text-secondary flex-1">{label}</span>
                  </label>
                );
              })}
              <div className="border-t border-border mt-1 px-3 pt-2">
                <button onClick={resetCols} className="text-xs text-accent hover:underline">Reset to default</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header border-b-2 border-table-header-border">
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap w-16">Sl. No.</th>
                {col("file_no")               && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap w-24">File No.</th>}
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Client Name</th>
                {col("business_type")         && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Business Type</th>}
                {col("pan")                   && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">PAN</th>}
                {col("date_of_incorporation") && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Date of Incorporation</th>}
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="px-4 py-12 text-center text-muted">
                    {hasFilters ? "No clients match your filters." : "No clients yet. Add the first one."}
                  </td>
                </tr>
              ) : (
                filtered.map((client, i) => {
                  const pan = client.compliance_details?.find(d => d.type === "pan")?.number ?? "—";
                  const doi = client.date_of_incorporation
                    ? new Date(client.date_of_incorporation).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—";
                  return (
                    <tr key={client.id} className="bg-white hover:bg-page transition-colors">
                      <td className="px-4 py-2.5 text-muted text-xs font-medium">{i + 1}</td>
                      {col("file_no")               && <td className="px-4 py-2.5 text-secondary text-xs font-mono">{client.file_number ?? "—"}</td>}
                      <td className="px-4 py-2.5 font-medium text-heading">{client.name}</td>
                      {col("business_type")         && <td className="px-4 py-2.5 text-secondary">{client.business_type ?? "—"}</td>}
                      {col("pan")                   && <td className="px-4 py-2.5 text-secondary font-mono text-xs">{pan}</td>}
                      {col("date_of_incorporation") && <td className="px-4 py-2.5 text-secondary text-sm">{doi}</td>}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5">
                          <Link href={`/clients/${client.id}`} title={isAdmin ? "Edit client" : "View client"} className="p-1.5 rounded hover:bg-page transition-colors text-accent hover:text-primary inline-flex">
                            {isAdmin ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                          </Link>
                          {isAdmin && (
                            <>
                              <button onClick={() => setConfirm({ id: client.id, name: client.name, activate: !client.is_active })} disabled={loading === client.id} title={client.is_active ? "Deactivate client" : "Activate client"} className={`p-1.5 rounded hover:bg-page transition-colors disabled:opacity-50 inline-flex ${client.is_active ? "text-warning hover:text-amber-700" : "text-success hover:text-green-800"}`}>
                                {client.is_active ? (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                )}
                              </button>
                              <button onClick={() => { setDeleteError(null); setDeleteConfirm({ id: client.id, name: client.name }); }} title="Delete client" className="p-1.5 rounded hover:bg-page transition-colors text-danger hover:text-red-700 inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Client?</h3>
            <p className="text-sm text-secondary mb-2">
              This will permanently delete the client organization <strong>{deleteConfirm.name}</strong> and all associated litigation records.
            </p>
            <p className="text-xs text-danger font-medium mb-5">This action cannot be undone.</p>
            {deleteError && <p className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2 text-sm bg-danger hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate/Deactivate Confirm Modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">
              {confirm.activate ? "Activate" : "Deactivate"} Client?
            </h3>
            <p className="text-sm text-secondary mb-5">
              {confirm.activate ? `"${confirm.name}" will be activated and accessible to its users.` : `"${confirm.name}" will be deactivated.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={handleToggle} disabled={!!loading} className={`flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium transition disabled:opacity-60 ${confirm.activate ? "bg-success hover:bg-green-700" : "bg-danger hover:bg-red-700"}`}>
                {loading ? "Processing…" : confirm.activate ? "Activate" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
