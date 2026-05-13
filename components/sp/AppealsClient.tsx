"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PER_PAGE_OPTIONS } from "@/lib/constants";

interface Proceeding {
  id: string;
  proceeding_type: { id: string; name: string } | null;
  authority_name: string | null;
  importance: string | null;
  status: string | null;
  to_be_completed_by: string | null;
  assigned_to_ids: string[] | null;
  possible_outcome: string | null;
  is_active: boolean;
}

interface Appeal {
  id: string;
  act_regulation: { id: string; name: string } | null;
  financial_year: { id: string; name: string } | null;
  assessment_year: { id: string; name: string } | null;
  status: string | null;
  created_at: string;
  client_org: { id: string; name: string } | null;
  proceedings: Proceeding[];
}

interface Props {
  appeals: Appeal[];
  clients: { id: string; name: string }[];
  teamMembers: { id: string; first_name: string; last_name: string }[];
  canEdit: boolean;
  totalCount: number;
  page: number;
  perPage: number;
  assessmentYears: string[];
  currentSearch: string;
  currentClient: string;
  currentAY: string;
  currentImportance: string;
  currentAssigned: string;
  currentStatus: string;
  currentSortDir: string;
}

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

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-blue-50 text-blue-700" },
  "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
};

function activeProceeding(proceedings: Proceeding[]): Proceeding | null {
  if (!proceedings?.length) return null;
  return proceedings.find((p) => p.is_active) ?? proceedings[proceedings.length - 1];
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function AppealsClient({
  appeals, clients, teamMembers, canEdit,
  totalCount, page, perPage, assessmentYears,
  currentSearch, currentClient, currentAY,
  currentImportance, currentAssigned, currentStatus, currentSortDir,
}: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentSearch);
  const isFirst = useRef(true);

  // Debounce search → push to URL after 400ms idle
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const timer = setTimeout(() => push({ search: searchInput, page: "1" }), 400);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line

  // Keep local search in sync if server resets it (e.g. Clear all)
  useEffect(() => { setSearchInput(currentSearch); }, [currentSearch]);

  function push(updates: Record<string, string>) {
    const merged: Record<string, string> = {
      search: currentSearch,
      client: currentClient,
      ay: currentAY,
      importance: currentImportance,
      assigned: currentAssigned,
      status: currentStatus,
      sort_dir: currentSortDir,
      page: String(page),
      per_page: String(perPage),
      ...updates,
    };
    const p = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (!v) return;
      if (k === "page" && v === "1") return;
      if (k === "per_page" && v === "25") return;
      if (k === "sort_dir" && v === "desc") return; // desc is default
      p.set(k, v);
    });
    router.push(`/litigations${p.toString() ? `?${p.toString()}` : ""}`);
  }

  function setFilter(key: string, value: string) {
    push({ [key]: value, page: "1" });
  }

  function clearAll() {
    setSearchInput("");
    router.push("/litigations");
  }

  const hasFilters = currentSearch || currentClient || currentAY || currentImportance || currentAssigned || currentStatus;
  const totalPages = Math.ceil(totalCount / perPage);
  const rowOffset = (page - 1) * perPage;
  const showingFrom = totalCount === 0 ? 0 : rowOffset + 1;
  const showingTo = Math.min(rowOffset + perPage, totalCount);

  const selCls = "px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";
  const btnPage = (active: boolean) =>
    `min-w-[36px] h-9 px-2 text-sm rounded-lg font-medium transition ${
      active
        ? "bg-[#1E3A5F] text-white"
        : "border border-[#E5E7EB] text-[#1A1A2E] hover:bg-[#F8F9FA]"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">Litigations</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">
            {totalCount} {hasFilters ? "matched" : ""} litigations
          </p>
        </div>
        {canEdit && (
          <Link
            href="/litigations/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-medium rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Litigation
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search client…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] w-44 bg-white"
        />
        <select value={currentClient} onChange={(e) => setFilter("client", e.target.value)} className={selCls}>
          <option value="">All Clients</option>
          {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={currentAY} onChange={(e) => setFilter("ay", e.target.value)} className={selCls}>
          <option value="">All Years</option>
          {assessmentYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={currentImportance} onChange={(e) => setFilter("importance", e.target.value)} className={selCls}>
          <option value="">All Importance</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={currentAssigned} onChange={(e) => setFilter("assigned", e.target.value)} className={selCls}>
          <option value="">All Staff</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
          ))}
        </select>
        <select value={currentStatus} onChange={(e) => setFilter("status", e.target.value)} className={selCls}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
        {/* Sort direction */}
        <button
          onClick={() => push({ sort_dir: currentSortDir === "asc" ? "desc" : "asc", page: "1" })}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg hover:bg-[#F8F9FA] transition text-[#1A1A2E]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {currentSortDir === "asc"
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
          {currentSortDir === "asc" ? "Oldest first" : "Newest first"}
        </button>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#1A1A2E] border border-[#E5E7EB] rounded-lg transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[#B0BDD0] bg-[#D1D9E6]">
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] w-10">#</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Client</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">FY / AY</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Act</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Importance</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Assigned To</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Deadline</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Outcome</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {appeals.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-[#6B7280]">
                    {hasFilters
                      ? "No litigations match your filters."
                      : canEdit
                      ? "No litigations yet. Click 'New Litigation' to get started."
                      : "No litigations found."}
                  </td>
                </tr>
              ) : (
                appeals.map((appeal, i) => {
                  const proc = activeProceeding(appeal.proceedings);
                  const impCfg = proc?.importance ? IMPORTANCE[proc.importance] : null;
                  const outCfg = proc?.possible_outcome ? OUTCOME[proc.possible_outcome] : null;
                  const assignedNames = (proc?.assigned_to_ids ?? [])
                    .map(id => teamMembers.find(m => m.id === id))
                    .filter(Boolean)
                    .map(m => `${m!.first_name} ${m!.last_name}`);
                  return (
                    <tr key={appeal.id} className="hover:bg-[#F8F9FA] transition-colors cursor-pointer" onClick={() => router.push(`/litigations/${appeal.id}`)}>
                      <td className="px-4 py-3 text-[#9CA3AF] text-xs">{rowOffset + i + 1}</td>
                      <td className="px-4 py-3 font-medium text-[#1A1A2E] whitespace-nowrap max-w-[180px] truncate">
                        {appeal.client_org?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] whitespace-nowrap text-xs">
                        {appeal.financial_year?.name && <span>{appeal.financial_year.name}</span>}
                        {appeal.financial_year?.name && appeal.assessment_year?.name && <span className="text-[#D1D5DB]"> / </span>}
                        {appeal.assessment_year?.name && <span>{appeal.assessment_year.name}</span>}
                        {!appeal.financial_year?.name && !appeal.assessment_year?.name && "—"}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] whitespace-nowrap max-w-[140px] truncate">
                        {appeal.act_regulation?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {impCfg ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${impCfg.cls}`}>
                            {impCfg.label}
                          </span>
                        ) : <span className="text-[#9CA3AF]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] whitespace-nowrap">
                        {assignedNames.length > 0 ? assignedNames.join(", ") : <span className="text-[#9CA3AF]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] whitespace-nowrap">
                        {fmtDate(proc?.to_be_completed_by ?? null)}
                      </td>
                      <td className="px-4 py-3">
                        {outCfg ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outCfg.cls}`}>
                            {outCfg.label}
                          </span>
                        ) : <span className="text-[#9CA3AF]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const s = STATUS[appeal.status ?? "open"];
                          return s
                            ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                            : <span className="text-[#9CA3AF]">—</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      {totalCount > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
          {/* Showing X–Y of Z + per-page selector */}
          <div className="flex items-center gap-3 text-sm text-[#6B7280]">
            <span>
              Showing {showingFrom}–{showingTo} of {totalCount} litigations
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs">Show</span>
              <select
                value={perPage}
                onChange={(e) => push({ per_page: e.target.value, page: "1" })}
                className="px-2 py-1 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs">per page</span>
            </div>
          </div>

          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => push({ page: String(page - 1) })}
                disabled={page === 1}
                className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>

              {pageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-[#9CA3AF] text-sm select-none">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => push({ page: String(p) })}
                    className={btnPage(p === page)}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                onClick={() => push({ page: String(page + 1) })}
                disabled={page === totalPages}
                className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
