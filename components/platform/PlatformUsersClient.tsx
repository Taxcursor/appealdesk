"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toggleAdminStatus } from "@/app/(platform)/platform/admins/actions";
import { toggleSpAdminStatus, deletePlatformSpAdmin } from "@/app/(platform)/platform/users/actions";

interface PlatformUser {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  role: string;
  designation?: string | null;
  is_active: boolean;
  created_at: string;
}

interface SpAdmin {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  designation: string | null;
  is_active: boolean;
  created_at: string;
  org_id: string;
  organization: { id: string; name: string } | null;
}

interface Props {
  platformUsers: PlatformUser[];
  spAdmins: SpAdmin[];
  currentUserId: string;
  isSuperAdmin: boolean;
  isPlatformAdmin?: boolean;
}

function fullName(u: { first_name: string; middle_name?: string | null; last_name: string }) {
  return [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" ");
}

const HEADER = "bg-table-header border-b-2 border-table-header-border";
const TH     = "text-left px-4 py-3 font-semibold text-heading";
const TH_C   = "text-center px-4 py-3 font-semibold text-heading w-10";
const TH_END = "text-left px-4 py-3 font-semibold text-heading";

interface NamedRecord { id: string; name: string; }

const STATUS_OPTIONS: NamedRecord[] = [
  { id: "active",   name: "Active" },
  { id: "inactive", name: "Inactive" },
];

const PLATFORM_ROLE_OPTIONS: NamedRecord[] = [
  { id: "super_admin",    name: "Super Admin" },
  { id: "platform_admin", name: "Platform Admin" },
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
        <span className={`flex-1 truncate ${!hasValue ? "text-muted" : isMulti ? "font-medium text-primary" : "text-heading"}`}>
          {triggerText}
        </span>
        {hasValue ? (
          <button
            onMouseDown={(e) => { e.stopPropagation(); onChange([]); }}
            className="text-muted hover:text-heading shrink-0 text-base leading-none"
          >×</button>
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
                onMouseDown={(e) => { e.preventDefault(); setPending([]); pendingRef.current = []; }}
                className="text-xs text-accent hover:underline"
              >Clear</button>
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
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isChecked ? "bg-primary border-primary" : "border-border-strong"}`}>
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

export default function PlatformUsersClient({ platformUsers, spAdmins, currentUserId, isSuperAdmin, isPlatformAdmin }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"platform" | "sp">("platform");

  // Platform users state
  const [pFilterRoles,    setPFilterRoles]    = useState<string[]>([]);
  const [pFilterStatuses, setPFilterStatuses] = useState<string[]>([]);
  const [pSortAsc, setPSortAsc] = useState(true);
  const [pToggling, setPToggling] = useState<string | null>(null);
  const [pConfirm, setPConfirm] = useState<{ id: string; name: string; activate: boolean } | null>(null);

  // SP admins state
  const [sFilterSps,          setSFilterSps]          = useState<string[]>([]);
  const [sFilterDesignations, setSFilterDesignations] = useState<string[]>([]);
  const [sFilterStatuses,     setSFilterStatuses]     = useState<string[]>([]);
  const [sSortAsc, setSSortAsc] = useState(true);
  const [sToggling, setSToggling] = useState<string | null>(null);
  const [sConfirmToggle, setSConfirmToggle] = useState<{ id: string; name: string; activate: boolean } | null>(null);
  const [sConfirmDelete, setSConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [sDeleting, setSDeleting] = useState<string | null>(null);

  // ── Platform users filtering
  const filteredPlatform = platformUsers
    .filter((u) => {
      if (pFilterRoles.length    && !pFilterRoles.includes(u.role))                              return false;
      if (pFilterStatuses.length && !pFilterStatuses.includes(u.is_active ? "active" : "inactive")) return false;
      return true;
    })
    .sort((a, b) => {
      const na = fullName(a), nb = fullName(b);
      return pSortAsc ? na.localeCompare(nb) : nb.localeCompare(na);
    });

  // ── Derive SP filter options from data
  const spOrgOptions: NamedRecord[] = [
    ...new Map(
      spAdmins
        .map((u) => u.organization)
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => [o.id, { id: o.id, name: o.name }])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const designationOptions: NamedRecord[] = [
    ...new Set(spAdmins.map((u) => u.designation).filter((v): v is string => !!v)),
  ].sort().map((v) => ({ id: v, name: v }));

  // ── SP admins filtering
  const filteredSp = spAdmins
    .filter((u) => {
      if (sFilterSps.length          && !sFilterSps.includes(u.org_id))                                   return false;
      if (sFilterDesignations.length && !sFilterDesignations.includes(u.designation ?? ""))               return false;
      if (sFilterStatuses.length     && !sFilterStatuses.includes(u.is_active ? "active" : "inactive"))   return false;
      return true;
    })
    .sort((a, b) => {
      const na = fullName(a), nb = fullName(b);
      return sSortAsc ? na.localeCompare(nb) : nb.localeCompare(na);
    });

  const pHasFilters = pFilterRoles.length > 0 || pFilterStatuses.length > 0;
  const sHasFilters = sFilterSps.length > 0 || sFilterDesignations.length > 0 || sFilterStatuses.length > 0;

  // ── Handlers
  async function handlePlatformToggle() {
    if (!pConfirm) return;
    setPToggling(pConfirm.id);
    try { await toggleAdminStatus(pConfirm.id, pConfirm.activate); }
    finally { setPToggling(null); setPConfirm(null); }
  }

  async function handleSpToggle() {
    if (!sConfirmToggle) return;
    setSToggling(sConfirmToggle.id);
    try { await toggleSpAdminStatus(sConfirmToggle.id, sConfirmToggle.activate); }
    finally { setSToggling(null); setSConfirmToggle(null); }
  }

  async function handleSpDelete() {
    if (!sConfirmDelete) return;
    setSDeleting(sConfirmDelete.id);
    try { await deletePlatformSpAdmin(sConfirmDelete.id); setSConfirmDelete(null); }
    finally { setSDeleting(null); }
  }

  return (
    <>
      {/* Tabs + Add button */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1 shadow-sm">
          {([["platform", "Platform Users"], ["sp", "SP Users"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab === key ? "bg-primary text-white" : "text-secondary hover:text-heading hover:bg-page"}`}>
              {label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === key ? "bg-white/20 text-white" : "bg-surface-hover text-secondary"}`}>
                {key === "platform" ? platformUsers.length : spAdmins.length}
              </span>
            </button>
          ))}
        </div>
        {(isSuperAdmin || (isPlatformAdmin && activeTab === "sp")) && (
          <button
            onClick={() => router.push(activeTab === "platform" ? "/platform/users/new-platform" : "/platform/users/new-sp")}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {activeTab === "platform" ? "Add Platform User" : "Add SP User"}
          </button>
        )}
      </div>

      {/* ── PLATFORM USERS TAB ── */}
      {activeTab === "platform" && (
        <>
          <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
            <MultiSelect
              options={PLATFORM_ROLE_OPTIONS}
              values={pFilterRoles}
              onChange={setPFilterRoles}
              placeholder="All Roles"
              searchable={false}
            />
            <MultiSelect
              options={STATUS_OPTIONS}
              values={pFilterStatuses}
              onChange={setPFilterStatuses}
              placeholder="All Statuses"
              searchable={false}
            />
            <button
              onClick={() => setPSortAsc(!pSortAsc)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-accent rounded-lg hover:bg-page transition text-heading h-[38px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {pSortAsc
                  ? <><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 19h4" /></>
                  : <><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 5h4" /></>
                }
              </svg>
              {pSortAsc ? "A → Z" : "Z → A"}
            </button>
          </div>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className={HEADER}>
                  <th className={TH_C}>#</th>
                  <th className={TH}>Name</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>Designation</th>
                  <th className={`${TH} w-24`}>Status</th>
                  {(isSuperAdmin || isPlatformAdmin) && <th className={TH_END}>Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPlatform.length === 0 ? (
                  <tr><td colSpan={(isSuperAdmin || isPlatformAdmin) ? 7 : 6} className="px-4 py-12 text-center text-secondary">
                    {pHasFilters ? "No users match the selected filters." : "No platform users found."}
                  </td></tr>
                ) : filteredPlatform.map((u, i) => {
                  const name = fullName(u);
                  const isMe = u.id === currentUserId;
                  return (
                    <tr key={u.id} className={`hover:bg-page transition-colors ${i % 2 === 1 ? "bg-stripe" : ""}`}>
                      <td className="px-4 py-3 text-center text-muted text-xs">{i + 1}</td>
                      <td className="px-4 py-3 text-secondary">
                        {name} {isMe && <span className="text-xs text-muted">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-secondary">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "super_admin" ? "bg-accent-light text-accent" : "bg-gray-100 text-gray-700"}`}>
                          {u.role === "super_admin" ? "Super Admin" : "Platform Admin"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-secondary">{u.designation ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {(isSuperAdmin || isPlatformAdmin) && (
                        <td className="px-4 py-3">
                          {/* platform_admin cannot toggle super_admin accounts */}
                          {!isMe && (isSuperAdmin || u.role !== "super_admin") && (
                            <button
                              onClick={() => setPConfirm({ id: u.id, name, activate: !u.is_active })}
                              disabled={pToggling === u.id}
                              title={u.is_active ? "Deactivate user" : "Activate user"}
                              className={`p-1.5 rounded hover:bg-surface-hover transition-colors disabled:opacity-50 inline-flex ${u.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}>
                              {u.is_active ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              )}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── SP USERS TAB ── */}
      {activeTab === "sp" && (
        <>
          <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
            <MultiSelect
              options={spOrgOptions}
              values={sFilterSps}
              onChange={setSFilterSps}
              placeholder="All Service Providers"
            />
            <MultiSelect
              options={designationOptions}
              values={sFilterDesignations}
              onChange={setSFilterDesignations}
              placeholder="All Designations"
            />
            <MultiSelect
              options={STATUS_OPTIONS}
              values={sFilterStatuses}
              onChange={setSFilterStatuses}
              placeholder="All Statuses"
              searchable={false}
            />
            <button
              onClick={() => setSSortAsc(!sSortAsc)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-accent rounded-lg hover:bg-page transition text-heading h-[38px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {sSortAsc
                  ? <><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 19h4" /></>
                  : <><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 5h4" /></>
                }
              </svg>
              {sSortAsc ? "A → Z" : "Z → A"}
            </button>
          </div>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className={HEADER}>
                  <th className={TH_C}>#</th>
                  <th className={TH}>Name</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Service Provider</th>
                  <th className={TH}>Designation</th>
                  <th className={`${TH} w-24`}>Status</th>
                  {(isSuperAdmin || isPlatformAdmin) && <th className={TH_END}>Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSp.length === 0 ? (
                  <tr><td colSpan={(isSuperAdmin || isPlatformAdmin) ? 7 : 6} className="px-4 py-12 text-center text-secondary">
                    {sHasFilters ? "No users match the selected filters." : "No SP admin users found."}
                  </td></tr>
                ) : filteredSp.map((u, i) => {
                  const name = fullName(u);
                  return (
                    <tr key={u.id} className={`hover:bg-page transition-colors ${i % 2 === 1 ? "bg-stripe" : ""}`}>
                      <td className="px-4 py-3 text-center text-muted text-xs">{i + 1}</td>
                      <td className="px-4 py-3 text-secondary">{name}</td>
                      <td className="px-4 py-3 text-secondary">{u.email}</td>
                      <td className="px-4 py-3 text-secondary">{u.organization?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-secondary">{u.designation ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {(isSuperAdmin || isPlatformAdmin) && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => setSConfirmToggle({ id: u.id, name, activate: !u.is_active })}
                              disabled={sToggling === u.id}
                              title={u.is_active ? "Deactivate user" : "Activate user"}
                              className={`p-1.5 rounded hover:bg-surface-hover transition-colors disabled:opacity-50 inline-flex ${u.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}>
                              {u.is_active ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              )}
                            </button>
                            <button onClick={() => setSConfirmDelete({ id: u.id, name })} title="Delete user"
                              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-500 hover:text-red-700 inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Confirm platform user toggle ── */}
      {pConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">{pConfirm.activate ? "Activate" : "Deactivate"} User?</h3>
            <p className="text-sm text-secondary mb-5">
              {pConfirm.activate ? `"${pConfirm.name}" will be able to log in again.` : `"${pConfirm.name}" will be blocked from logging in.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPConfirm(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={handlePlatformToggle} disabled={!!pToggling}
                className={`flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium transition disabled:opacity-60 ${pConfirm.activate ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                {pToggling ? "Processing…" : pConfirm.activate ? "Activate" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm SP admin toggle ── */}
      {sConfirmToggle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">{sConfirmToggle.activate ? "Activate" : "Deactivate"} SP User?</h3>
            <p className="text-sm text-secondary mb-5">
              {sConfirmToggle.activate ? `"${sConfirmToggle.name}" will be able to log in again.` : `"${sConfirmToggle.name}" will be blocked from logging in.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setSConfirmToggle(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={handleSpToggle} disabled={!!sToggling}
                className={`flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium transition disabled:opacity-60 ${sConfirmToggle.activate ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                {sToggling ? "Processing…" : sConfirmToggle.activate ? "Activate" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm SP admin delete ── */}
      {sConfirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">Delete User?</h3>
            <p className="text-sm text-secondary mb-2">
              This will permanently delete <strong>{sConfirmDelete.name}</strong> and revoke their access.
            </p>
            <p className="text-xs text-red-600 font-medium mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setSConfirmDelete(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={handleSpDelete} disabled={!!sDeleting}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {sDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
