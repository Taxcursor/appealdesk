"use client";

import { useState } from "react";
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

interface Props {
  providers: Provider[];
  userRole: UserRole;
}

const isPlatformRole = (role: UserRole) =>
  role === "super_admin" || role === "platform_admin";

export default function ProvidersClient({ providers, userRole }: Props) {
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

  // Activate / deactivate confirm
  const [confirm, setConfirm] = useState<{ id: string; name: string; activate: boolean } | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = isPlatformRole(userRole);

  const q = search.toLowerCase();
  const filtered = providers
    .filter((sp) =>
      sp.name.toLowerCase().includes(q) ||
      (sp.business_type ?? "").toLowerCase().includes(q) ||
      (sp.city ?? "").toLowerCase().includes(q) ||
      (sp.is_active ? "active" : "inactive").includes(q)
    )
    .sort((a, b) => sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

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
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service providers…"
            className="w-full pl-9 pr-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-white"
          />
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                <th className="text-center px-4 py-3 font-medium text-[#1A1A2E] w-10">#</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">
                  <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="inline-flex items-center gap-1 hover:text-[#1E3A5F] transition-colors"
                  >
                    Name
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {sortAsc
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      }
                    </svg>
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Business Type</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">City</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Added</th>
                <th className="text-left px-4 py-3 font-medium text-[#1A1A2E]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">
                    {search ? `No results for "${search}"` : "No service providers yet. Add the first one."}
                  </td>
                </tr>
              ) : (
                filtered.map((sp, i) => (
                  <tr key={sp.id} className={`hover:bg-[#F8F9FA] transition-colors ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                    <td className="px-4 py-3 text-center text-[#9CA3AF] text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1A1A2E]">{sp.name}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{sp.business_type ?? "—"}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{sp.city ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        sp.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      }`}>
                        {sp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]">
                      {new Date(sp.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        {/* Edit */}
                        <Link href={`/platform/providers/${sp.id}`} title="Edit service provider"
                          className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </Link>

                        {/* Activate / Deactivate */}
                        <button
                          onClick={() => setConfirm({ id: sp.id, name: sp.name, activate: !sp.is_active })}
                          disabled={loading === sp.id}
                          title={sp.is_active ? "Deactivate provider" : "Activate provider"}
                          className={`p-1.5 rounded hover:bg-[#F3F4F6] transition-colors disabled:opacity-50 inline-flex ${sp.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800"}`}
                        >
                          {sp.is_active ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">
              {confirm.activate ? "Activate" : "Deactivate"} Service Provider?
            </h3>
            <p className="text-sm text-[#6B7280] mb-5">
              {confirm.activate
                ? `"${confirm.name}" and all its users will be activated.`
                : `"${confirm.name}" and all its users will be blocked from logging in.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition"
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
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#1A1A2E]">Delete Service Provider?</h3>
                <p className="text-sm text-[#6B7280] mt-1">
                  <span className="font-medium text-[#1A1A2E]">&quot;{deleteConfirm.name}&quot;</span> and all its users will be removed. This can be recovered from the Recycle Bin.
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
                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                disabled={!!loading}
                className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition disabled:opacity-60"
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
