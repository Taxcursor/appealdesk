"use client";

import { useState } from "react";
import { UserRole } from "@/lib/types";
import {
  createMasterRecord,
  createChildMasterRecord,
  renameMasterRecord,
  deleteMasterRecord,
  toggleMasterRecord,
} from "@/app/(platform)/platform/masters/actions";

const FLAT_TABS = [
  { key: "business_type", label: "Business Types" },
  { key: "financial_year", label: "Financial Years" },
  { key: "assessment_year", label: "Assessment Years" },
];

const ACTS_TAB = "acts_proceedings";

interface MasterRecord {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  records: MasterRecord[];
  userRole: UserRole;
}

// ─── Shared inline input style ────────────────────────────────────────────────
const inp =
  "px-2 py-1 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

// ─── Shared icon SVG paths ────────────────────────────────────────────────────
const TrashIcon = ({ className }: { className: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

export default function MastersClient({ records, userRole }: Props) {
  // Role-based access
  const canDelete = userRole === "super_admin" || userRole === "platform_admin";
  const [activeTab, setActiveTab] = useState("business_type");

  // Flat tab state
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [flatSaving, setFlatSaving] = useState(false);
  const [flatError, setFlatError] = useState<string | null>(null);

  // Acts & Proceedings state
  const [expandedActs, setExpandedActs] = useState<Set<string>>(new Set());
  const [addingActForm, setAddingActForm] = useState(false);
  const [newActName, setNewActName] = useState("");
  const [addingUnderActId, setAddingUnderActId] = useState<string | null>(null);
  const [newProcName, setNewProcName] = useState("");
  const [actSaving, setActSaving] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  // Inline edit state (shared)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Toggle confirm
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<{
    id: string;
    name: string;
    activate: boolean;
  } | null>(null);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ─── Flat tab helpers ─────────────────────────────────────────────────────
  const currentLabel = FLAT_TABS.find((t) => t.key === activeTab)?.label ?? "";
  const q = search.toLowerCase();
  const isFYorAY =
    activeTab === "financial_year" || activeTab === "assessment_year";
  const filtered = records
    .filter((r) => r.type === activeTab && r.parent_id === null)
    .filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.is_active ? "active" : "inactive").includes(q),
    )
    .sort((a, b) =>
      (isFYorAY ? true : !sortAsc)
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name),
    );

  async function handleFlatAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setFlatSaving(true);
    setFlatError(null);
    try {
      await createMasterRecord(newName.trim(), activeTab);
      setNewName("");
    } catch (err) {
      setFlatError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setFlatSaving(false);
    }
  }

  // ─── Inline rename ────────────────────────────────────────────────────────
  function startEdit(id: string, currentName: string) {
    setEditingId(id);
    setEditValue(currentName);
  }

  async function saveEdit(id: string) {
    if (!editValue.trim()) return;
    setEditSaving(true);
    try {
      await renameMasterRecord(id, editValue.trim());
      setEditingId(null);
    } catch {
      /* silently revert */
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Acts & Proceedings helpers ───────────────────────────────────────────
  const acts = records
    .filter((r) => r.type === "act_regulation")
    .sort((a, b) => a.sort_order - b.sort_order);
  const procsByAct = records
    .filter((r) => r.type === "proceeding_type" && r.parent_id)
    .reduce(
      (acc, r) => {
        if (!acc[r.parent_id!]) acc[r.parent_id!] = [];
        acc[r.parent_id!].push(r);
        return acc;
      },
      {} as Record<string, MasterRecord[]>,
    );

  async function handleAddAct(e: React.FormEvent) {
    e.preventDefault();
    if (!newActName.trim()) return;
    setActSaving(true);
    setActError(null);
    try {
      await createMasterRecord(newActName.trim(), "act_regulation");
      setNewActName("");
      setAddingActForm(false);
    } catch (err) {
      setActError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setActSaving(false);
    }
  }

  async function handleAddProceeding(e: React.FormEvent, actId: string) {
    e.preventDefault();
    if (!newProcName.trim()) return;
    setActSaving(true);
    setActError(null);
    try {
      await createChildMasterRecord(
        newProcName.trim(),
        "proceeding_type",
        actId,
      );
      setNewProcName("");
      setAddingUnderActId(null);
    } catch (err) {
      setActError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setActSaving(false);
    }
  }

  // ─── Toggle (with confirm modal) ─────────────────────────────────────────
  async function handleToggleConfirm() {
    if (!toggleConfirm) return;
    setToggling(toggleConfirm.id);
    try {
      await toggleMasterRecord(toggleConfirm.id, toggleConfirm.activate);
    } finally {
      setToggling(null);
      setToggleConfirm(null);
    }
  }

  // ─── Delete (with confirm modal + error state) ────────────────────────────
  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleteError(null);
    setDeleting(confirmDelete.id);
    try {
      await deleteMasterRecord(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeleting(null);
    }
  }

  const allTabs = [...FLAT_TABS, { key: ACTS_TAB, label: "Acts" }];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-[#E5E7EB] rounded-xl p-1 w-fit shadow-sm flex-wrap">
        {allTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              setNewName("");
              setFlatError(null);
              setSearch("");
              setSortAsc(true);
              setEditingId(null);
              setActError(null);
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab === t.key ? "bg-[#1E3A5F] text-white" : "text-[#6B7280] hover:text-[#1A1A2E] hover:bg-[#F8F9FA]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Flat list tabs ───────────────────────────────────────────────────── */}
      {activeTab !== ACTS_TAB && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
          {/* Add row */}
          <div className="p-4 border-b border-[#E5E7EB]">
            <form onSubmit={handleFlatAdd} className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={`Add new ${currentLabel.slice(0, -1).toLowerCase()}…`}
                className="flex-1 px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
              <button
                type="submit"
                disabled={flatSaving || !newName.trim()}
                className="px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                {flatSaving ? "Adding…" : "Add"}
              </button>
            </form>
            {flatError && (
              <p className="text-xs text-red-600 mt-2">{flatError}</p>
            )}
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-[#E5E7EB]">
            <div className="relative max-w-sm">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full pl-9 pr-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-white"
              />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                <th className="text-center px-4 py-3 font-medium text-[#1A1A2E] w-10">
                  #
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">
                  <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="inline-flex items-center gap-1 hover:text-[#1E3A5F]"
                  >
                    Name
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      {sortAsc ? (
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
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-[#6B7280]"
                  >
                    {search ? `No results for "${search}"` : "No records yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((rec, i) => (
                  <tr
                    key={rec.id}
                    className={`hover:bg-[#F8F9FA] transition-colors ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}
                  >
                    <td className="px-4 py-3 text-center text-[#9CA3AF] text-xs">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 text-[#1A1A2E]">
                      {editingId === rec.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className={`${inp} flex-1`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(rec.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => saveEdit(rec.id)}
                            disabled={editSaving}
                            className="text-xs font-medium text-[#1E3A5F] hover:underline disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs font-medium text-[#9CA3AF] hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        rec.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${rec.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {rec.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        {editingId !== rec.id && (
                          <button
                            onClick={() => startEdit(rec.id, rec.name)}
                            title="Edit"
                            className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex"
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
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setToggleConfirm({
                              id: rec.id,
                              name: rec.name,
                              activate: !rec.is_active,
                            })
                          }
                          disabled={toggling === rec.id}
                          title={rec.is_active ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded hover:bg-[#F3F4F6] transition-colors disabled:opacity-50 inline-flex ${rec.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}
                        >
                          {rec.is_active ? (
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
                                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                              />
                            </svg>
                          ) : (
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
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDelete({ id: rec.id, name: rec.name });
                            }}
                            disabled={deleting === rec.id}
                            title="Delete"
                            className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 disabled:opacity-50 inline-flex"
                          >
                            <TrashIcon className="w-4 h-4" />
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
      )}

      {/* ── Acts & Proceedings tree ──────────────────────────────────────────── */}
      {activeTab === ACTS_TAB && (
        <div className="space-y-3">
          {actError && <p className="text-xs text-red-600">{actError}</p>}

          {acts.map((act) => {
            const procs = (procsByAct[act.id] ?? []).sort(
              (a, b) => a.sort_order - b.sort_order,
            );
            const isExpanded = expandedActs.has(act.id);

            return (
              <div
                key={act.id}
                className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden"
              >
                {/* Act header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-[#F8F9FA] border-b border-[#E5E7EB]">
                  <button
                    onClick={() =>
                      setExpandedActs((prev) => {
                        const s = new Set(prev);
                        if (s.has(act.id)) {
                          s.delete(act.id);
                        } else {
                          s.add(act.id);
                        }
                        return s;
                      })
                    }
                    className="text-[#6B7280] hover:text-[#1A1A2E] transition flex-shrink-0"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>

                  <div className="flex-1 min-w-0">
                    {editingId === act.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className={`${inp} flex-1`}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(act.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => saveEdit(act.id)}
                          disabled={editSaving}
                          className="text-xs font-medium text-[#1E3A5F] hover:underline disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-[#9CA3AF] hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#1A1A2E]">
                          {act.name}
                        </span>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${act.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {act.is_active ? "Active" : "Inactive"}
                        </span>
                        <span className="text-xs text-[#9CA3AF]">
                          {procs.length} proceeding
                          {procs.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {editingId !== act.id && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => {
                          setAddingUnderActId(act.id);
                          setNewProcName("");
                          setExpandedActs((prev) => new Set(prev).add(act.id));
                        }}
                        className="text-xs font-medium text-[#4A6FA5] hover:text-[#1E3A5F] px-2 py-1"
                      >
                        + Add Proceeding
                      </button>
                      <button
                        onClick={() => startEdit(act.id, act.name)}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() =>
                          setToggleConfirm({
                            id: act.id,
                            name: act.name,
                            activate: !act.is_active,
                          })
                        }
                        disabled={toggling === act.id}
                        title={act.is_active ? "Deactivate" : "Activate"}
                        className={`p-1.5 rounded hover:bg-[#F3F4F6] transition-colors disabled:opacity-50 inline-flex ${act.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}
                      >
                        {act.is_active ? (
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
                              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                            />
                          </svg>
                        ) : (
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
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        )}
                      </button>
                      {/* Acts can only be deleted when they have no proceedings */}
                      {canDelete && procs.length === 0 && (
                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDelete({ id: act.id, name: act.name });
                          }}
                          title="Delete act"
                          className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 inline-flex"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Proceedings list */}
                {isExpanded && (
                  <div>
                    {procs.length === 0 && addingUnderActId !== act.id && (
                      <p className="px-6 py-4 text-sm text-[#9CA3AF] italic">
                        No proceedings yet. Add one above.
                      </p>
                    )}

                    {procs.map((proc, i) => (
                      <div
                        key={proc.id}
                        className={`flex items-center gap-3 px-6 py-3 border-b border-[#F3F4F6] ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""} hover:bg-[#F8F9FA] transition-colors`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#B0BDD0] shrink-0" />
                        <div className="flex-1 min-w-0">
                          {editingId === proc.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className={`${inp} flex-1`}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(proc.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                              />
                              <button
                                onClick={() => saveEdit(proc.id)}
                                disabled={editSaving}
                                className="text-xs font-medium text-[#1E3A5F] hover:underline disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs text-[#9CA3AF] hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm text-[#1A1A2E]">
                              {proc.name}
                            </span>
                          )}
                        </div>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${proc.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {proc.is_active ? "Active" : "Inactive"}
                        </span>
                        {editingId !== proc.id && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => startEdit(proc.id, proc.name)}
                              title="Edit"
                              className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() =>
                                setToggleConfirm({
                                  id: proc.id,
                                  name: proc.name,
                                  activate: !proc.is_active,
                                })
                              }
                              disabled={toggling === proc.id}
                              title={proc.is_active ? "Deactivate" : "Activate"}
                              className={`p-1.5 rounded hover:bg-[#F3F4F6] transition-colors disabled:opacity-50 inline-flex ${proc.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}
                            >
                              {proc.is_active ? (
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                              )}
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => {
                                  setDeleteError(null);
                                  setConfirmDelete({
                                    id: proc.id,
                                    name: proc.name,
                                  });
                                }}
                                title="Delete"
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 inline-flex"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add proceeding inline form */}
                    {addingUnderActId === act.id && (
                      <form
                        onSubmit={(e) => handleAddProceeding(e, act.id)}
                        className="flex items-center gap-2 px-6 py-3 bg-[#EEF2FF] border-b border-[#E5E7EB]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4A6FA5] shrink-0" />
                        <input
                          value={newProcName}
                          onChange={(e) => setNewProcName(e.target.value)}
                          placeholder="Proceeding name, e.g. Assessment u/s 143(2)"
                          className={`${inp} flex-1`}
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={actSaving || !newProcName.trim()}
                          className="px-3 py-1.5 text-xs bg-[#1E3A5F] text-white rounded-lg font-medium disabled:opacity-50"
                        >
                          {actSaving ? "Adding…" : "Add"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingUnderActId(null)}
                          className="text-xs text-[#9CA3AF] hover:text-[#6B7280]"
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add new Act */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-4">
            {addingActForm ? (
              <form onSubmit={handleAddAct} className="flex items-center gap-2">
                <input
                  value={newActName}
                  onChange={(e) => setNewActName(e.target.value)}
                  placeholder="Act / Regulation name, e.g. The Customs Act, 1962"
                  className={`${inp} flex-1`}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={actSaving || !newActName.trim()}
                  className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {actSaving ? "Adding…" : "Add Act"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddingActForm(false)}
                  className="text-sm text-[#9CA3AF] hover:text-[#6B7280]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setAddingActForm(true)}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#4A6FA5] hover:text-[#1E3A5F] transition"
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
                Add New Act / Regulation
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Toggle Confirm Modal ─────────────────────────────────────────────── */}
      {toggleConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">
              {toggleConfirm.activate ? "Activate" : "Deactivate"} Record?
            </h3>
            <p className="text-sm text-[#6B7280] mb-5">
              {toggleConfirm.activate
                ? `"${toggleConfirm.name}" will become active and available for selection in new records.`
                : `"${toggleConfirm.name}" will be deactivated and hidden from selection in new records.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setToggleConfirm(null)}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleConfirm}
                disabled={!!toggling}
                className={`flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium transition disabled:opacity-60 ${toggleConfirm.activate ? "bg-green-600 hover:bg-green-700" : "bg-amber-500 hover:bg-amber-600"}`}
              >
                {toggling
                  ? "Processing…"
                  : toggleConfirm.activate
                    ? "Activate"
                    : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#1A1A2E]">
                  Delete Record?
                </h3>
                <p className="text-sm text-[#6B7280] mt-1">
                  <span className="font-medium text-[#1A1A2E]">
                    &quot;{confirmDelete.name}&quot;
                  </span>{" "}
                  will be removed. This can be recovered from the Recycle Bin.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmDelete(null);
                  setDeleteError(null);
                }}
                disabled={!!deleting}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!!deleting}
                className="flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium bg-red-600 hover:bg-red-700 transition disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
