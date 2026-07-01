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
  role: string;
  designation: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
  org_id: string;
  organization: { id: string; name: string; type: string } | null;
}

interface NamedRecord { id: string; name: string; }

interface Props {
  users: UserRecord[];
  currentUserId: string;
  isAdmin: boolean;
  clientOrgs: ClientOrgOption[];
  currentTab: "team" | "clients";
  currentRoles: string[];
  currentOrgs: string[];
  currentDesignations: string[];
  currentStatuses: string[];
  currentSortDir: string;
}

const ROLE_LABELS: Record<string, string> = { sp_admin: "Admin", sp_staff: "Staff", client: "Client" };
const ROLE_COLORS: Record<string, string> = {
  sp_admin: "bg-purple-50 text-purple-700",
  sp_staff: "bg-blue-50 text-blue-700",
  client:   "bg-orange-50 text-orange-700",
};

const STATUS_OPTIONS: NamedRecord[] = [
  { id: "active",   name: "Active" },
  { id: "inactive", name: "Inactive" },
];

function fullName(u: { first_name: string; middle_name: string | null; last_name: string }) {
  return [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" ");
}

// Multi-select dropdown — buffers selections locally, applies on close.
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
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-white cursor-pointer min-w-[144px] max-w-[200px] h-[38px] select-none"
        onClick={() => (open ? applyAndClose() : openDropdown())}
      >
        <span className={`flex-1 truncate ${!hasValue ? "text-[#9CA3AF]" : isMulti ? "font-medium text-primary" : "text-[#1A1A2E]"}`}>
          {triggerText}
        </span>
        {hasValue ? (
          <button
            onMouseDown={(e) => { e.stopPropagation(); onChange([]); }}
            className="text-[#9CA3AF] hover:text-[#1A1A2E] shrink-0 text-base leading-none"
          >×</button>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50 w-60 max-h-64 flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-[#F3F4F6] shrink-0">
              <input
                ref={inputRef}
                className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {pending.length > 0 && (
            <div className="px-3 py-1.5 border-b border-[#F3F4F6] flex items-center justify-between shrink-0">
              <span className="text-xs text-[#6B7280]">{pending.length} selected</span>
              <button
                onMouseDown={(e) => { e.preventDefault(); setPending([]); pendingRef.current = []; }}
                className="text-xs text-accent hover:underline"
              >Clear</button>
            </div>
          )}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[#9CA3AF]">No matches</div>
            ) : (
              filtered.map((o) => {
                const isChecked = pending.includes(o.id);
                return (
                  <button
                    key={o.id}
                    onMouseDown={(e) => { e.preventDefault(); toggle(o.id); }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[#F8F9FA] ${isChecked ? "bg-accent-light" : ""}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isChecked ? "bg-primary border-primary" : "border-[#D1D5DB]"}`}>
                      {isChecked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isChecked ? "font-medium text-[#1A1A2E]" : "text-[#4B5563]"}`}>
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

export default function UsersClient({
  users, currentUserId, isAdmin, clientOrgs,
  currentTab, currentRoles, currentOrgs, currentDesignations, currentStatuses, currentSortDir,
}: Props) {
  const router = useRouter();
  const [togglingId,    setTogglingId]    = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  const teamUsers   = users.filter((u) => u.role === "sp_admin" || u.role === "sp_staff");
  const clientUsers = users.filter((u) => u.role === "client");
  const tabUsers    = currentTab === "team" ? teamUsers : clientUsers;

  // Derive filter options from the current tab's full user list
  const roleOptions: NamedRecord[] = [...new Set(tabUsers.map((u) => u.role))]
    .map((r) => ({ id: r, name: ROLE_LABELS[r] ?? r }));

  const orgOptions: NamedRecord[] = [
    ...new Map(
      tabUsers
        .map((u) => u.organization)
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => [o.id, { id: o.id, name: o.name }])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const designationOptions: NamedRecord[] = [
    ...new Set(tabUsers.map((u) => u.designation).filter((v): v is string => !!v)),
  ].sort().map((v) => ({ id: v, name: v }));

  // Apply filters + sort
  const filtered = tabUsers
    .filter((u) => {
      if (currentRoles.length       && !currentRoles.includes(u.role))                              return false;
      if (currentOrgs.length        && !currentOrgs.includes(u.org_id))                             return false;
      if (currentDesignations.length && !currentDesignations.includes(u.designation ?? ""))         return false;
      if (currentStatuses.length    && !currentStatuses.includes(u.is_active ? "active" : "inactive")) return false;
      return true;
    })
    .sort((a, b) => {
      const na = fullName(a), nb = fullName(b);
      return currentSortDir === "asc" ? na.localeCompare(nb) : nb.localeCompare(na);
    });

  const hasFilters = currentRoles.length > 0 || currentOrgs.length > 0 || currentDesignations.length > 0 || currentStatuses.length > 0;

  function push(updates: Record<string, string>) {
    const merged: Record<string, string> = {
      tab:         currentTab,
      role:        currentRoles.join(","),
      org:         currentOrgs.join(","),
      designation: currentDesignations.join(","),
      status:      currentStatuses.join(","),
      sort_dir:    currentSortDir,
      ...updates,
    };
    const p = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (!v) return;
      if (k === "tab"      && v === "team") return; // team is default
      if (k === "sort_dir" && v === "asc")  return; // asc is default
      p.set(k, v);
    });
    router.push(`/users${p.toString() ? `?${p.toString()}` : ""}`);
  }

  function setMultiFilter(key: string, ids: string[]) {
    push({ [key]: ids.join(",") });
  }

  // Switching tabs clears all filters (options differ between tabs)
  function switchTab(tab: "team" | "clients") {
    router.push(tab === "clients" ? "/users?tab=clients" : "/users");
  }

  async function handleToggle(id: string, isActive: boolean) {
    setTogglingId(id);
    try { await toggleUserStatus(id, !isActive); } finally { setTogglingId(null); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try { await deleteUser(confirmDelete.id); setConfirmDelete(null); } finally { setDeletingId(null); }
  }

  const colSpan = isAdmin ? 8 : 7;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">Users</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">
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
      <div className="flex gap-1 bg-white border border-[#E5E7EB] rounded-xl p-1 shadow-sm mb-4 w-fit">
        {(["team", "clients"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              currentTab === tab ? "bg-primary text-white" : "text-secondary hover:text-heading hover:bg-page"
            }`}
          >
            {tab === "team" ? `Users (${teamUsers.length})` : `Client Users (${clientUsers.length})`}
          </button>
        ))}
      </div>

      {/* Filters — Role, Organisation, Designation, Status */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <MultiSelect
          options={roleOptions}
          values={currentRoles}
          onChange={(ids) => setMultiFilter("role", ids)}
          placeholder="All Roles"
          searchable={false}
        />
        <MultiSelect
          options={orgOptions}
          values={currentOrgs}
          onChange={(ids) => setMultiFilter("org", ids)}
          placeholder="All Organisations"
        />
        <MultiSelect
          options={designationOptions}
          values={currentDesignations}
          onChange={(ids) => setMultiFilter("designation", ids)}
          placeholder="All Designations"
        />
        <MultiSelect
          options={STATUS_OPTIONS}
          values={currentStatuses}
          onChange={(ids) => setMultiFilter("status", ids)}
          placeholder="All Statuses"
          searchable={false}
        />

        {/* Sort toggle */}
        <button
          onClick={() => push({ sort_dir: currentSortDir === "asc" ? "desc" : "asc" })}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8F9FA] transition text-[#1A1A2E]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {currentSortDir === "asc"
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
          {currentSortDir === "asc" ? "A → Z" : "Z → A"}
        </button>

        {hasFilters && (
          <button
            onClick={() => push({ role: "", org: "", designation: "", status: "" })}
            className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#1A1A2E] border border-[#E5E7EB] rounded-lg transition"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header border-b-2 border-table-header-border">
                <th className="text-center px-4 py-3 font-medium text-[#1A1A2E] w-10">#</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Email</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Role</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Organisation</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Designation</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Status</th>
                {isAdmin && <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-[#6B7280]">
                    {hasFilters ? "No users match your filters." : "No users found."}
                  </td>
                </tr>
              ) : (
                filtered.map((u, i) => (
                  <tr key={u.id} className={`hover:bg-[#F8F9FA] transition-colors ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                    <td className="px-4 py-3 text-center text-[#9CA3AF] text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1A1A2E]">
                      {fullName(u)}
                      {u.id === currentUserId && <span className="ml-1.5 text-xs text-[#9CA3AF]">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]">{u.organization?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{u.designation ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <Link href={`/users/${u.id}/edit`} title="Edit user"
                            className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-accent hover:text-primary inline-flex">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </Link>
                          {u.id !== currentUserId && (
                            <>
                              <button
                                onClick={() => handleToggle(u.id, u.is_active)}
                                disabled={togglingId === u.id}
                                title={u.is_active ? "Deactivate user" : "Activate user"}
                                className={`p-1.5 rounded hover:bg-[#F3F4F6] transition-colors disabled:opacity-50 inline-flex ${u.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}
                              >
                                {u.is_active ? (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ id: u.id, name: fullName(u) })}
                                title="Delete user"
                                className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-500 hover:text-red-700 inline-flex"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete User?</h3>
            <p className="text-sm text-[#6B7280] mb-2">
              This will permanently delete <strong>{confirmDelete.name}</strong> and revoke their access.
            </p>
            <p className="text-xs text-red-600 font-medium mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={!!deletingId}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
