"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PER_PAGE_OPTIONS } from "@/lib/constants";
import { exportLitigationsReport, getLitigationReport } from "@/app/(sp)/litigations/actions";

interface AppealProceeding {
  id: string;
  status: string | null;
  deleted_at: string | null;
  created_at: string;
  proceeding_type: { id: string; name: string } | null;
}

interface Appeal {
  id: string;
  act_regulation: { id: string; name: string } | null;
  financial_year: { id: string; name: string } | null;
  assessment_year: { id: string; name: string } | null;
  status: string | null;
  created_at: string;
  client_org: { id: string; name: string } | null;
  proceedings?: AppealProceeding[];
}

interface NamedRecord {
  id: string;
  name: string;
}

interface Props {
  appeals: Appeal[];
  clients: NamedRecord[];
  acts: NamedRecord[];
  financialYears: NamedRecord[];
  assessmentYears: NamedRecord[];
  teamMembers: NamedRecord[];
  canEdit: boolean;
  totalCount: number;
  page: number;
  perPage: number;
  currentClients: string[];
  currentActs: string[];
  currentFYs: string[];
  currentAYs: string[];
  currentStatuses: string[];
  currentAssigned: string[];
  currentSortDir: string;
}

const STATUS_DISPLAY: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-blue-50 text-blue-700" },
  "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
};

const STATUS_OPTIONS: NamedRecord[] = [
  { id: "open", name: "Open" },
  { id: "in-progress", name: "In Progress" },
  { id: "closed", name: "Closed" },
];

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3)
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

// Multi-select dropdown with checkboxes and optional search.
// Selections are buffered locally and applied (pushed to URL) when the dropdown closes.
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref so the click-outside handler always sees the latest pending without restating the effect
  const pendingRef = useRef<string[]>([]);

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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        applyAndClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setPending((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      pendingRef.current = next;
      return next;
    });
  }

  const filtered =
    searchable && query
      ? options.filter((o) =>
          o.name.toLowerCase().includes(query.toLowerCase()),
        )
      : options;

  // Trigger label
  let triggerText: string;
  if (values.length === 0) triggerText = placeholder;
  else if (values.length === 1)
    triggerText = options.find((o) => o.id === values[0])?.name ?? "1 selected";
  else triggerText = `${values.length} selected`;

  const hasValue = values.length > 0;
  const isMulti = values.length > 1;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-2 text-sm border border-accent rounded-lg bg-white cursor-pointer min-w-25 max-w-32.5 h-9.5 select-none"
        onClick={() => (open ? applyAndClose() : openDropdown())}
      >
        <span
          className={`flex-1 truncate ${
            !hasValue
              ? "text-muted"
              : isMulti
                ? "font-medium text-primary"
                : "text-heading"
          }`}
        >
          {triggerText}
        </span>
        {hasValue ? (
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="text-muted hover:text-heading shrink-0 text-base leading-none"
          >
            ×
          </button>
        ) : (
          <svg
            className="w-3.5 h-3.5 shrink-0 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </div>

      {/* Dropdown */}
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
              <span className="text-xs text-secondary">
                {pending.length} selected
              </span>
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggle(o.id);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-page ${isChecked ? "bg-accent-light" : ""}`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                        isChecked
                          ? "bg-primary border-primary"
                          : "border-border-strong"
                      }`}
                    >
                      {isChecked && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <span
                      className={`text-sm flex-1 truncate ${isChecked ? "font-medium text-heading" : "text-secondary"}`}
                    >
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

// @CodeScene(disable:"Complex Method")
export default function AppealsClient({
  appeals,
  clients,
  acts,
  financialYears,
  assessmentYears,
  teamMembers,
  canEdit,
  totalCount,
  page,
  perPage,
  currentClients,
  currentActs,
  currentFYs,
  currentAYs,
  currentStatuses,
  currentAssigned,
  currentSortDir,
}: Props) {
  const router = useRouter();

  const [exporting, setExporting] = useState<"excel" | "pdf" | "docx" | null>(
    null,
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function handler(e: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport(format: "excel" | "pdf" | "docx") {
    setExporting(format);
    setExportMenuOpen(false);
    try {
      const data = await exportLitigationsReport({
        filterClients: currentClients,
        filterActs: currentActs,
        filterFYs: currentFYs,
        filterAYs: currentAYs,
        filterStatuses: currentStatuses,
        filterAssigned: currentAssigned,
      });
      const dateStamp = new Date().toISOString().slice(0, 10);
      if (format === "excel") {
        const { generateExcel } = await import("@/lib/reports/excel");
        triggerDownload(generateExcel(data), `litigations-${dateStamp}.xlsx`);
      } else if (format === "pdf") {
        const { generatePDF } = await import("@/lib/reports/pdf");
        triggerDownload(generatePDF(data), `litigations-${dateStamp}.pdf`);
      } else {
        const { generateDocx } = await import("@/lib/reports/docx");
        triggerDownload(
          await generateDocx(data),
          `litigations-${dateStamp}.docx`,
        );
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  async function handleDownloadLitigation(e: React.MouseEvent, appealId: string, clientName: string) {
    e.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(appealId);
    try {
      const data = await getLitigationReport(appealId);
      const { generateLitigationPDF } = await import("@/lib/reports/pdf");
      const dateStamp = new Date().toISOString().slice(0, 10);
      triggerDownload(generateLitigationPDF(data), `litigation-${clientName.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}-${dateStamp}.pdf`);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Report download failed. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  function push(updates: Record<string, string>) {
    const merged: Record<string, string> = {
      client: currentClients.join(","),
      act: currentActs.join(","),
      fy: currentFYs.join(","),
      ay: currentAYs.join(","),
      status: currentStatuses.join(","),
      assigned: currentAssigned.join(","),
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
      if (k === "sort_dir" && v === "desc") return;
      p.set(k, v);
    });
    router.push(`/litigations${p.toString() ? `?${p.toString()}` : ""}`);
  }

  function setMultiFilter(key: string, ids: string[]) {
    push({ [key]: ids.join(","), page: "1" });
  }

  function clearAll() {
    router.push("/litigations");
  }

  const hasFilters =
    currentClients.length > 0 ||
    currentActs.length > 0 ||
    currentFYs.length > 0 ||
    currentAYs.length > 0 ||
    currentStatuses.length > 0 ||
    currentAssigned.length > 0;

  const totalPages = Math.ceil(totalCount / perPage);
  const rowOffset = (page - 1) * perPage;
  const showingFrom = totalCount === 0 ? 0 : rowOffset + 1;
  const showingTo = Math.min(rowOffset + perPage, totalCount);

  const btnPage = (active: boolean) =>
    `min-w-9 h-9 px-2 text-sm rounded-lg font-medium transition ${
      active
        ? "bg-primary text-white"
        : "border border-border text-heading hover:bg-page"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Litigations</h1>
          <p className="text-secondary text-sm mt-0.5">
            {totalCount} {hasFilters ? "matched" : ""} litigations
          </p>
        </div>
        {canEdit && (
          <Link
            href="/litigations/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Litigation
          </Link>
        )}
      </div>

      {/* Filters — Client, Act, FY, AY, Status, Assigned To */}
      <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-2 items-center">
        <MultiSelect
          options={clients}
          values={currentClients}
          onChange={(ids) => setMultiFilter("client", ids)}
          placeholder="All Clients"
        />
        <MultiSelect
          options={acts}
          values={currentActs}
          onChange={(ids) => setMultiFilter("act", ids)}
          placeholder="All Acts"
        />
        <MultiSelect
          options={financialYears}
          values={currentFYs}
          onChange={(ids) => setMultiFilter("fy", ids)}
          placeholder="All FY"
        />
        <MultiSelect
          options={assessmentYears}
          values={currentAYs}
          onChange={(ids) => setMultiFilter("ay", ids)}
          placeholder="All AY"
        />
        <MultiSelect
          options={STATUS_OPTIONS}
          values={currentStatuses}
          onChange={(ids) => setMultiFilter("status", ids)}
          placeholder="All Statuses"
          searchable={false}
        />
        <MultiSelect
          options={teamMembers}
          values={currentAssigned}
          onChange={(ids) => setMultiFilter("assigned", ids)}
          placeholder="All Assigned"
        />

        {/* Sort direction */}
        <button
          onClick={() =>
            push({
              sort_dir: currentSortDir === "asc" ? "desc" : "asc",
              page: "1",
            })
          }
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-accent rounded-lg hover:bg-page transition text-heading"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {currentSortDir === "asc" ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            )}
          </svg>
          {currentSortDir === "asc" ? "Oldest first" : "Newest first"}
        </button>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-2 text-sm text-secondary hover:text-heading border border-border rounded-lg transition"
          >
            Clear all
          </button>
        )}

        {/* Export dropdown */}
        <div ref={exportMenuRef} className="relative ml-auto">
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            disabled={!!exporting || totalCount === 0}
            title={
              exporting ? `Exporting ${exporting.toUpperCase()}…` : "Export"
            }
            className="inline-flex items-center justify-center w-9.5 h-9.5 border border-accent rounded-lg hover:bg-page disabled:opacity-50 disabled:cursor-not-allowed transition text-accent"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg z-50 w-44 py-1">
              {(["excel", "pdf", "docx"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-page text-heading transition"
                >
                  {fmt === "excel" && "Excel (.xlsx)"}
                  {fmt === "pdf" && "PDF (.pdf)"}
                  {fmt === "docx" && "Word (.docx)"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-table-header-border bg-table-header">
                <th className="text-left px-4 py-3 font-semibold text-heading w-10">
                  #
                </th>
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">
                  Client
                </th>
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap w-24">
                  FY
                </th>
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap w-24">
                  AY
                </th>
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap">
                  Act
                </th>
                <th className="text-left px-4 py-3 font-semibold text-heading whitespace-nowrap w-28">
                  Status
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {appeals.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-secondary"
                  >
                    {hasFilters
                      ? "No litigations match your filters."
                      : canEdit
                        ? "No litigations yet. Click 'New Litigation' to get started."
                        : "No litigations found."}
                  </td>
                </tr>
              ) : (
                appeals.map((appeal, i) => {
                  const procs = [...(appeal.proceedings ?? [])]
                    .filter(p => !p.deleted_at)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                  const rowNum = rowOffset + i + 1;
                  const s = STATUS_DISPLAY[appeal.status ?? "open"];
                  return (
                    <React.Fragment key={appeal.id}>
                      {/* ── Litigation row ── */}
                      <tr
                        className="hover:bg-page transition-colors cursor-pointer"
                        onClick={() => router.push(`/litigations/${appeal.id}`)}
                      >
                        <td className="px-4 py-3 text-muted text-xs font-medium">{rowNum}</td>
                        <td className="px-4 py-3 text-secondary whitespace-nowrap max-w-80 truncate" title={appeal.client_org?.name ?? "—"}>
                          {appeal.client_org?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-secondary whitespace-nowrap text-sm">
                          {appeal.financial_year?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-secondary whitespace-nowrap text-sm">
                          {appeal.assessment_year?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-secondary whitespace-nowrap max-w-72 truncate" title={appeal.act_regulation?.name ?? "—"}>
                          {appeal.act_regulation?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {s ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDownloadLitigation(e, appeal.id, appeal.client_org?.name ?? "litigation")}
                            disabled={downloadingId === appeal.id}
                            title="Download PDF Report"
                            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-page transition-colors text-muted hover:text-accent disabled:opacity-40"
                          >
                            {downloadingId === appeal.id ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            )}
                          </button>
                        </td>
                      </tr>
                      {/* ── Proceeding sub-rows ── */}
                      {procs.map((proc, j) => {
                        const ps = STATUS_DISPLAY[proc.status ?? "open"];
                        const letter = String.fromCharCode(97 + j); // a, b, c…
                        return (
                          <tr
                            key={proc.id}
                            className="bg-accent-faint hover:bg-accent-light transition-colors cursor-pointer border-t border-dashed border-border"
                            onClick={() => router.push(`/litigations/${appeal.id}`)}
                          >
                            <td className="px-4 py-2.5 text-muted text-xs pl-7">{rowNum}.{letter}</td>
                            <td className="px-4 py-2.5 text-muted whitespace-nowrap max-w-80 truncate text-xs" title={appeal.client_org?.name ?? "—"}>
                              {appeal.client_org?.name ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted whitespace-nowrap text-xs">
                              {appeal.financial_year?.name ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted whitespace-nowrap text-xs">
                              {appeal.assessment_year?.name ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted whitespace-nowrap max-w-72 truncate text-xs" title={proc.proceeding_type?.name ?? (appeal.act_regulation?.name ?? "—")}>
                              {proc.proceeding_type?.name ?? (appeal.act_regulation?.name ?? "—")}
                            </td>
                            <td className="px-4 py-2.5">
                              {ps ? (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>{ps.label}</span>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                            <td />
                          </tr>
                        );
                      })}
                    </React.Fragment>
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
          <div className="flex items-center gap-3 text-sm text-secondary">
            <span>
              Showing {showingFrom}–{showingTo} of {totalCount} litigations
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs">Show</span>
              <select
                value={perPage}
                onChange={(e) => push({ per_page: e.target.value, page: "1" })}
                className="px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-xs">per page</span>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => push({ page: String(page - 1) })}
                disabled={page === 1}
                className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>
              {pageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-1 text-muted text-sm select-none"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => push({ page: String(p) })}
                    className={btnPage(p === page)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => push({ page: String(page + 1) })}
                disabled={page === totalPages}
                className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition"
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
