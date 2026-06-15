"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { toggleProviderStatus, deleteProvider } from "@/app/(platform)/platform/providers/actions";
import { UserRole } from "@/lib/types";

interface Provider {
  id: string;
  name: string;
  business_type?: string;
  city?: string;
  is_active: boolean;
  created_at: string;
}

interface NamedRecord {
  id: string;
  name: string;
}

interface Props {
  providers: Provider[];
  userRole: UserRole;
}

const STATUS_OPTIONS: NamedRecord[] = [
  { id: "active",   name: "Active" },
  { id: "inactive", name: "Inactive" },
];

const isPlatformRole = (role: UserRole) =>
  role === "super_admin" || role === "platform_admin";

function MultiSelect({
  options,
  values,
  onChange,
  placeholder,
  searchable = true,
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        applyAndClose();
      }
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
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-accent rounded-lg bg-white cursor-pointer min-w-[144px] max-w-[200px] h-[38px] select-none"
        onClick={() => (open ? applyAndClose() : openDropdown())}
      >
        <span
          className={`flex-1 truncate ${
            !hasValue ? "text-muted" : isMulti ? "font-medium text-primary" : "text-heading"
          }`}
        >
          {triggerText}
        </span>
        {hasValue ? (
          <button
            onMouseDown={(e) => { e.stopPropagation(); onChange([]); }}
            className="text-muted hover:text-heading shrink-0 text-base leading-none"
          >
            ×
          </button>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-50 w-60 max-h-64 flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-surface-hover shrink-0">
              <input
                ref={inputRef}
                className="w-full px-2 py-1.5 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {pending.length > 0 && (
            <div className="px-3 py-1.5 border-b border-surface-hover flex items-center justify-between shrink-0">
              <span className="text-xs text-secondary">{pending.length} selected</span>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPending([]);
                  pendingRef.current = [];
                }}
                className="text-xs text-accent hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">No matches</div>
            ) : (
              filtered.map((o) => {
                const isChecked = pending.includes(o.id);
                return (
                  <button
                    key={o.id}
                    onMouseDown={(e) => { e.preventDefault(); toggle(o.id); }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-page ${isChecked ? "bg-blue-50/50" : ""}`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                        isChecked ? "bg-primary border-primary" : "border-border-strong"
                      }`}
                    >
                      {isChecked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isChecked ? "font-medium text-heading" : "text-secondary"}`}>
                      {o.name}
                    </span>
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

export default function ProvidersClient({ providers, userRole }: Props) {
  const [filterName, setFilterName]               = useState("");
  const [filterBusinessTypes, setFilterBusinessTypes] = useState<string[]>([]);
  const [filterCities, setFilterCities]           = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses]       = useState<string[]>([]);
  const [sortAsc, setSortAsc]                     = useState(false);

  const [loading, setLoading]           = useState<string | null>(null);
  const [confirm, setConfirm]           = useState<{ id: string; name: string; activate: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError]   = useState<string | null>(null);

  const canDelete = isPlatformRole(userRole);

  // Derive unique options from loaded data
  const businessTypeOptions: NamedRecord[] = Array.from(
    new Set(providers.map((p) => p.business_type).filter(Boolean))
  )
    .sort()
    .map((bt) => ({ id: bt!, name: bt! }));

  const cityOptions: NamedRecord[] = Array.from(
    new Set(providers.map((p) => p.city).filter(Boolean))
  )
    .sort()
    .map((c) => ({ id: c!, name: c! }));

  const q = filterName.toLowerCase();
  const filtered = providers
    .filter((sp) => {
      if (q && !sp.name.toLowerCase().includes(q)) return false;
      if (filterBusinessTypes.length && !filterBusinessTypes.includes(sp.business_type ?? "")) return false;
      if (filterCities.length && !filterCities.includes(sp.city ?? "")) return false;
      if (filterStatuses.length) {
        const statusKey = sp.is_active ? "active" : "inactive";
        if (!filterStatuses.includes(statusKey)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      sortAsc
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at)
    );

  const hasFilters =
    !!filterName || filterBusinessTypes.length > 0 || filterCities.length > 0 || filterStatuses.length > 0;

  function clearAll() {
    setFilterName("");
    setFilterBusinessTypes([]);
    setFilterCities([]);
    setFilterStatuses([]);
    setSortAsc(false);
  }

  async function handleToggle() {
    if (!confirm) return;
    setLoading(confirm.id);
    try {
      await toggleProviderStatus(confirm.id, confirm.activate);
    } finally {
      setLoading(null);
      setConfirm(null);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleteError(null);
    setLoading(deleteConfirm.id);
    try {
      const result = await deleteProvider(deleteConfirm.id);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteConfirm(null);
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {/* Filter bar */}
      <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        {/* Name search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Search name…"
            className="pl-9 pr-3 py-2 text-sm border border-accent rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary h-[38px] w-48"
          />
          {filterName && (
            <button
              onClick={() => setFilterName("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-heading text-base leading-none"
            >
              ×
            </button>
          )}
        </div>

        <MultiSelect
          options={businessTypeOptions}
          values={filterBusinessTypes}
          onChange={setFilterBusinessTypes}
          placeholder="Business Type"
        />

        <MultiSelect
          options={cityOptions}
          values={filterCities}
          onChange={setFilterCities}
          placeholder="City"
        />

        <MultiSelect
          options={STATUS_OPTIONS}
          values={filterStatuses}
          onChange={setFilterStatuses}
          placeholder="Status"
          searchable={false}
        />

        {/* Sort by Added date */}
        <button
          onClick={() => setSortAsc((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-accent rounded-lg hover:bg-page transition text-heading h-[38px]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {sortAsc
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
          {sortAsc ? "Oldest first" : "Newest first"}
        </button>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-2 text-sm text-secondary hover:text-heading border border-border rounded-lg transition"
          >
            Clear all
          </button>
        )}

        <span className="ml-auto text-sm text-secondary">
          {filtered.length}{hasFilters ? " matched" : ""} provider{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header border-b-2 border-table-header-border">
                <th className="text-center px-4 py-3 font-semibold text-heading w-10">#</th>
                <th className="text-left px-4 py-3 font-semibold text-heading">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-heading">Business Type</th>
                <th className="text-left px-4 py-3 font-semibold text-heading">City</th>
                <th className="text-left px-4 py-3 font-semibold text-heading w-24">Status</th>
                <th className="text-left text-nowrap px-4 py-3 font-semibold text-heading w-28">Uploaded on</th>
                <th className="text-left px-4 py-3 font-semibold text-heading w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-secondary">
                    {hasFilters ? "No service providers match your filters." : "No service providers yet. Add the first one."}
                  </td>
                </tr>
              ) : (
                filtered.map((sp, i) => (
                  <tr key={sp.id} className={`hover:bg-page transition-colors ${i % 2 === 1 ? "bg-stripe" : ""}`}>
                    <td className="px-4 py-3 text-center text-muted text-xs">{i + 1}</td>
                    <td className="px-4 py-3 text-secondary" title={sp.name}>{sp.name}</td>
                    <td className="px-4 py-3 text-secondary">{sp.business_type ?? "—"}</td>
                    <td className="px-4 py-3 text-secondary">{sp.city ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        sp.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      }`}>
                        {sp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {new Date(sp.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        {/* Edit */}
                        <Link
                          href={`/platform/providers/${sp.id}`}
                          title="Edit service provider"
                          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>

                        {/* Activate / Deactivate */}
                        <button
                          onClick={() => setConfirm({ id: sp.id, name: sp.name, activate: !sp.is_active })}
                          disabled={loading === sp.id}
                          title={sp.is_active ? "Deactivate provider" : "Activate provider"}
                          className={`p-1.5 rounded hover:bg-surface-hover transition-colors disabled:opacity-50 inline-flex ${
                            sp.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"
                          }`}
                        >
                          {sp.is_active ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>

                        {/* Delete — platform roles only */}
                        {canDelete && (
                          <button
                            onClick={() => { setDeleteError(null); setDeleteConfirm({ id: sp.id, name: sp.name }); }}
                            disabled={loading === sp.id}
                            title="Delete service provider"
                            className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 disabled:opacity-50 inline-flex"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm SP Status Modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">
              {confirm.activate ? "Activate" : "Deactivate"} Service Provider?
            </h3>
            <p className="text-sm text-secondary mb-5">
              {confirm.activate
                ? `"${confirm.name}" and all its users will be activated.`
                : `"${confirm.name}" and all its users will be blocked from logging in.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                onClick={handleToggle}
                disabled={!!loading}
                className={`flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium transition disabled:opacity-60 ${
                  confirm.activate ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {loading ? "Processing…" : confirm.activate ? "Activate" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-heading">Delete Service Provider?</h3>
                <p className="text-sm text-secondary mt-1">
                  This will permanently delete <span className="font-medium text-heading">&quot;{deleteConfirm.name}&quot;</span> and all its users and associated data.
                </p>
                <p className="text-xs text-red-600 font-medium mt-2">This action cannot be undone.</p>
              </div>
            </div>

            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                disabled={!!loading}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!!loading}
                className="flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium bg-red-600 hover:bg-red-700 transition disabled:opacity-60"
              >
                {loading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
