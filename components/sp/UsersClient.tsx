"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toggleUserStatus, deleteUser } from "@/app/(sp)/users/actions";
import type { ClientOrgOption } from "@/lib/bulk-import/types";
import SplitImportButton from "@/components/sp/SplitImportButton";

interface UserRecord {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  mobile_number: string | null;
  mobile_country_code: string | null;
  role: string;
  designation: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
  org_id: string;
  organization: { id: string; name: string; type: string } | null;
}

interface NamedRecord { id: string; name: string; }

// ─── Column definitions — separate per tab ────────────────────────────────────
const TEAM_COLUMNS = [
  { key: "email_id",    label: "Email ID"    },
  { key: "mobile_no",   label: "Mobile No."  },
  { key: "role",        label: "Role"        },
  { key: "designation", label: "Designation" },
  { key: "status",      label: "Status"      },
] as const;

const CLIENT_COLUMNS = [
  { key: "client_name", label: "Name of the Client" },
  { key: "email_id",    label: "Email ID"            },
  { key: "mobile_no",   label: "Mobile No."          },
  { key: "designation", label: "Designation"         },
  { key: "status",      label: "Status"              },
] as const;

type TeamColKey   = (typeof TEAM_COLUMNS)[number]["key"];
type ClientColKey = (typeof CLIENT_COLUMNS)[number]["key"];
const ALL_TEAM_KEYS:   TeamColKey[]   = TEAM_COLUMNS.map(c => c.key)   as TeamColKey[];
const ALL_CLIENT_KEYS: ClientColKey[] = CLIENT_COLUMNS.map(c => c.key) as ClientColKey[];

function storageKey(userId: string, tab: "team" | "clients") {
  return `appealdesk_user_col_vis_${tab}_${userId}`;
}

interface Props {
  users: UserRecord[];
  currentUserId: string;
  userId: string;
  isAdmin: boolean;
  clientOrgs: ClientOrgOption[];
  currentTab: "team" | "clients";
  currentRoles: string[];
  currentOrgs: string[];
  currentDesignations: string[];
  currentStatuses: string[];
  currentSortDir: string;
}

const ROLE_LABELS: Record<string, string> = {
  sp_admin: "Admin",
  sp_staff: "Staff",
  director: "Director",
  guest_manager: "Guest Manager",
  guest_user: "Guest User",
  client: "Client",
};
const ROLE_COLORS: Record<string, string> = {
  sp_admin: "bg-purple-50 text-purple-700",
  sp_staff: "bg-blue-50 text-blue-700",
  director: "bg-indigo-50 text-indigo-700",
  guest_manager: "bg-teal-50 text-teal-700",
  guest_user: "bg-gray-100 text-gray-600",
  client:   "bg-orange-50 text-orange-700",
};

const STATUS_OPTIONS: NamedRecord[] = [
  { id: "active",   name: "Active"   },
  { id: "inactive", name: "Inactive" },
];

function fullName(u: { first_name: string; middle_name: string | null; last_name: string }) {
  return [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" ");
}

function ColCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors cursor-pointer ${checked ? "bg-primary border-primary" : "border-border-strong"}`}>
      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </div>
  );
}

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
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-white cursor-pointer min-w-[144px] max-w-[200px] h-[38px] select-none"
        onClick={() => (open ? applyAndClose() : openDropdown())}
      >
        <span className={`flex-1 truncate ${!hasValue ? "text-muted" : isMulti ? "font-medium text-primary" : "text-heading"}`} title={triggerText}>{triggerText}</span>
        {hasValue ? (
          <button onMouseDown={(e) => { e.stopPropagation(); onChange([]); }} className="text-muted hover:text-heading shrink-0 text-base leading-none">×</button>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
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

export default function UsersClient({
  users, currentUserId, userId, isAdmin, clientOrgs,
  currentTab, currentRoles, currentOrgs, currentDesignations, currentStatuses, currentSortDir,
}: Props) {
  const router = useRouter();
  const [togglingId,    setTogglingId]    = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  // Separate visible-col state per tab
  const [teamCols,   setTeamCols]   = useState<Set<TeamColKey>   | null>(null);
  const [clientCols, setClientCols] = useState<Set<ClientColKey> | null>(null);

  const effectiveTeam   = teamCols   ?? new Set<TeamColKey>(ALL_TEAM_KEYS);
  const effectiveClient = clientCols ?? new Set<ClientColKey>(ALL_CLIENT_KEYS);

  const teamCol   = (k: TeamColKey)   => effectiveTeam.has(k);
  const clientCol = (k: ClientColKey) => effectiveClient.has(k);

  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Load from localStorage for both tabs
  useEffect(() => {
    try {
      const ts = localStorage.getItem(storageKey(userId, "team"));
      if (ts) { const p = JSON.parse(ts) as TeamColKey[]; setTeamCols(new Set(p.filter(k => ALL_TEAM_KEYS.includes(k)))); }
      else      setTeamCols(new Set(ALL_TEAM_KEYS));
    } catch { setTeamCols(new Set(ALL_TEAM_KEYS)); }
    try {
      const cs = localStorage.getItem(storageKey(userId, "clients"));
      if (cs) { const p = JSON.parse(cs) as ClientColKey[]; setClientCols(new Set(p.filter(k => ALL_CLIENT_KEYS.includes(k)))); }
      else      setClientCols(new Set(ALL_CLIENT_KEYS));
    } catch { setClientCols(new Set(ALL_CLIENT_KEYS)); }
  }, [userId]);

  function toggleTeamCol(key: TeamColKey) {
    setTeamCols(prev => {
      const base = prev ?? new Set(ALL_TEAM_KEYS);
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(storageKey(userId, "team"), JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  }

  function toggleClientCol(key: ClientColKey) {
    setClientCols(prev => {
      const base = prev ?? new Set(ALL_CLIENT_KEYS);
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(storageKey(userId, "clients"), JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  }

  function resetCols() {
    if (currentTab === "team") {
      setTeamCols(new Set(ALL_TEAM_KEYS));
      try { localStorage.removeItem(storageKey(userId, "team")); } catch { /* */ }
    } else {
      setClientCols(new Set(ALL_CLIENT_KEYS));
      try { localStorage.removeItem(storageKey(userId, "clients")); } catch { /* */ }
    }
  }

  // Visible col count for colSpan (Sl.No + Name (fixed) + visible + Actions)
  const visibleColCount = currentTab === "team"
    ? 3 + effectiveTeam.size
    : 3 + effectiveClient.size;

  useEffect(() => {
    if (!colMenuOpen) return;
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colMenuOpen]);

  const teamUsers   = users.filter((u) =>
    ["sp_admin", "sp_staff", "director", "guest_manager", "guest_user"].includes(u.role)
  );
  const clientUsers = users.filter((u) => u.role === "client");
  const tabUsers    = currentTab === "team" ? teamUsers : clientUsers;

  const roleOptions: NamedRecord[] = [...new Set(tabUsers.map((u) => u.role))]
    .map((r) => ({ id: r, name: ROLE_LABELS[r] ?? r }));

  const orgOptions: NamedRecord[] = [
    ...new Map(
      tabUsers.map((u) => u.organization).filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => [o.id, { id: o.id, name: o.name }])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const designationOptions: NamedRecord[] = [
    ...new Set(tabUsers.map((u) => u.designation).filter((v): v is string => !!v)),
  ].sort().map((v) => ({ id: v, name: v }));

  const filtered = tabUsers
    .filter((u) => {
      if (currentRoles.length        && !currentRoles.includes(u.role))                                return false;
      if (currentOrgs.length         && !currentOrgs.includes(u.org_id))                               return false;
      if (currentDesignations.length && !currentDesignations.includes(u.designation ?? ""))            return false;
      if (currentStatuses.length     && !currentStatuses.includes(u.is_active ? "active" : "inactive")) return false;
      return true;
    })
    .sort((a, b) => {
      const na = fullName(a), nb = fullName(b);
      return currentSortDir === "asc" ? na.localeCompare(nb) : nb.localeCompare(na);
    });

  const hasFilters = currentRoles.length > 0 || currentOrgs.length > 0 || currentDesignations.length > 0 || currentStatuses.length > 0;

  function push(updates: Record<string, string>) {
    const merged: Record<string, string> = {
      tab: currentTab, role: currentRoles.join(","), org: currentOrgs.join(","),
      designation: currentDesignations.join(","), status: currentStatuses.join(","),
      sort_dir: currentSortDir, ...updates,
    };
    const p = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (!v) return;
      if (k === "tab"      && v === "team") return;
      if (k === "sort_dir" && v === "asc")  return;
      p.set(k, v);
    });
    router.push(`/users${p.toString() ? `?${p.toString()}` : ""}`);
  }

  function setMultiFilter(key: string, ids: string[]) { push({ [key]: ids.join(",") }); }
  function switchTab(tab: "team" | "clients") { router.push(tab === "clients" ? "/users?tab=clients" : "/users"); }

  async function handleToggle(id: string, isActive: boolean) {
    setTogglingId(id);
    try { await toggleUserStatus(id, !isActive); } finally { setTogglingId(null); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try { await deleteUser(confirmDelete.id); setConfirmDelete(null); } finally { setDeletingId(null); }
  }

  // Current columns list for the settings panel
  const currentColDefs  = currentTab === "team" ? TEAM_COLUMNS   : CLIENT_COLUMNS;
  const toggleCol       = currentTab === "team"
    ? (k: string) => toggleTeamCol(k as TeamColKey)
    : (k: string) => toggleClientCol(k as ClientColKey);
  const isColChecked    = currentTab === "team"
    ? (k: string) => effectiveTeam.has(k as TeamColKey)
    : (k: string) => effectiveClient.has(k as ClientColKey);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Users</h1>
          <p className="text-secondary text-sm mt-0.5">
            {hasFilters ? `${filtered.length} of ${tabUsers.length}` : tabUsers.length} users
            {currentTab === "team" ? " in your team" : " from client organisations"}
          </p>
        </div>
        {isAdmin && (
          <SplitImportButton
            addHref={currentTab === "team" ? "/users/new-sp" : "/users/new-client"}
            addLabel={currentTab === "team" ? "Add User" : "Add Client User"}
            importType={currentTab === "team" ? "team-users" : "client-users"}
            clientOrgs={clientOrgs}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-border rounded-xl p-1 shadow-sm mb-4 w-fit">
        {(["team", "clients"] as const).map((tab) => (
          <button key={tab} onClick={() => switchTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${currentTab === tab ? "bg-primary text-white" : "text-secondary hover:text-heading hover:bg-page"}`}
          >
            {tab === "team" ? `Users (${teamUsers.length})` : `Client Users (${clientUsers.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        {currentTab === "team" && (
          <MultiSelect options={roleOptions} values={currentRoles} onChange={(ids) => setMultiFilter("role", ids)} placeholder="All Roles" searchable={false} />
        )}
        <MultiSelect options={orgOptions}         values={currentOrgs}         onChange={(ids) => setMultiFilter("org", ids)}         placeholder={currentTab === "team" ? "All Organisations" : "All Clients"} />
        <MultiSelect options={designationOptions} values={currentDesignations} onChange={(ids) => setMultiFilter("designation", ids)} placeholder="All Designations" />
        <MultiSelect options={STATUS_OPTIONS}     values={currentStatuses}     onChange={(ids) => setMultiFilter("status", ids)}      placeholder="All Statuses" searchable={false} />

        <button onClick={() => push({ sort_dir: currentSortDir === "asc" ? "desc" : "asc" })} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-page transition text-heading">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {currentSortDir === "asc" ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
          {currentSortDir === "asc" ? "A → Z" : "Z → A"}
        </button>

        {hasFilters && (
          <button onClick={() => push({ role: "", org: "", designation: "", status: "" })} className="px-3 py-2 text-sm text-muted hover:text-heading border border-border rounded-lg transition">Clear all</button>
        )}

        {/* Column settings */}
        <div ref={colMenuRef} className="relative ml-auto">
          <button onClick={() => setColMenuOpen(v => !v)} title="Column settings"
            className={`inline-flex items-center justify-center w-9.5 h-9.5 border rounded-lg hover:bg-page transition ${colMenuOpen ? "border-primary text-primary bg-accent-light" : "border-accent text-accent"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 w-52 py-2">
              <p className="px-3 pb-2 text-xs font-semibold text-heading border-b border-border mb-1">Column Visibility</p>
              {currentColDefs.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-page cursor-pointer select-none">
                  <ColCheckbox checked={isColChecked(key)} onClick={() => toggleCol(key)} />
                  <span onClick={() => toggleCol(key)} className="text-sm text-secondary flex-1">{label}</span>
                </label>
              ))}
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
                {currentTab === "team" ? (
                  <>
                    <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Name</th>
                    {teamCol("email_id")    && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Email ID</th>}
                    {teamCol("mobile_no")   && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Mobile No.</th>}
                    {teamCol("role")        && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Role</th>}
                    {teamCol("designation") && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Designation</th>}
                    {teamCol("status")      && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Status</th>}
                  </>
                ) : (
                  <>
                    <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Name of the User</th>
                    {clientCol("client_name") && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Name of the Client</th>}
                    {clientCol("email_id")    && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Email ID</th>}
                    {clientCol("mobile_no")   && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Mobile No.</th>}
                    {clientCol("designation") && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Designation</th>}
                    {clientCol("status")      && <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Status</th>}
                  </>
                )}
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="px-4 py-12 text-center text-muted">
                    {hasFilters ? "No users match your filters." : "No users found."}
                  </td>
                </tr>
              ) : (
                filtered.map((u, i) => {
                  const mobile = [u.mobile_country_code, u.mobile_number].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={u.id} className={`hover:bg-page transition-colors ${i % 2 === 1 ? "bg-stripe" : ""}`}>
                      <td className="px-4 py-2.5 text-muted text-xs font-medium">{i + 1}</td>
                      {currentTab === "team" ? (
                        <>
                          <td className="px-4 py-2.5 font-medium text-heading">
                            {fullName(u)}{u.id === currentUserId && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                          </td>
                          {teamCol("email_id")    && <td className="px-4 py-2.5 text-secondary">{u.email}</td>}
                          {teamCol("mobile_no")   && <td className="px-4 py-2.5 text-secondary font-mono text-xs">{mobile}</td>}
                          {teamCol("role") && (
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>{ROLE_LABELS[u.role] ?? u.role}</span>
                            </td>
                          )}
                          {teamCol("designation") && <td className="px-4 py-2.5 text-secondary">{u.designation ?? "—"}</td>}
                          {teamCol("status") && (
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{u.is_active ? "Active" : "Inactive"}</span>
                            </td>
                          )}
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 font-medium text-heading">
                            {fullName(u)}{u.id === currentUserId && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                          </td>
                          {clientCol("client_name") && <td className="px-4 py-2.5 text-secondary">{u.organization?.name ?? "—"}</td>}
                          {clientCol("email_id")    && <td className="px-4 py-2.5 text-secondary">{u.email}</td>}
                          {clientCol("mobile_no")   && <td className="px-4 py-2.5 text-secondary font-mono text-xs">{mobile}</td>}
                          {clientCol("designation") && <td className="px-4 py-2.5 text-secondary">{u.designation ?? "—"}</td>}
                          {clientCol("status") && (
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{u.is_active ? "Active" : "Inactive"}</span>
                            </td>
                          )}
                        </>
                      )}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5">
                          {isAdmin && (
                            <Link href={`/users/${u.id}/edit`} title="Edit user" className="p-1.5 rounded hover:bg-page transition-colors text-accent hover:text-primary inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </Link>
                          )}
                          {isAdmin && u.id !== currentUserId && (
                            <>
                              <button onClick={() => handleToggle(u.id, u.is_active)} disabled={togglingId === u.id} title={u.is_active ? "Deactivate user" : "Activate user"}
                                className={`p-1.5 rounded hover:bg-page transition-colors disabled:opacity-50 inline-flex ${u.is_active ? "text-warning hover:text-amber-700" : "text-success hover:text-green-800"}`}>
                                {u.is_active ? (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                )}
                              </button>
                              <button onClick={() => setConfirmDelete({ id: u.id, name: fullName(u) })} title="Delete user" className="p-1.5 rounded hover:bg-page transition-colors text-danger hover:text-red-700 inline-flex">
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

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">Delete User?</h3>
            <p className="text-sm text-secondary mb-2">
              This will permanently delete <strong>{confirmDelete.name}</strong> and revoke their access.
            </p>
            <p className="text-xs text-danger font-medium mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={handleDelete} disabled={!!deletingId} className="flex-1 px-4 py-2 text-sm bg-danger hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
