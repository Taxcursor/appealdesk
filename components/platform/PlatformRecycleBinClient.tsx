"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  restorePlatformUser, purgePlatformUser,
  restoreMasterRecord, purgeMasterRecord,
  restoreProvider, purgeProvider,
  restoreClient, purgeClient,
} from "@/app/(platform)/platform/recycle-bin/actions";

function daysLeft(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (1000 * 60 * 60 * 24)));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function DaysChip({ deletedAt }: { deletedAt: string }) {
  const days = daysLeft(deletedAt);
  const cls = days <= 3
    ? "bg-red-50 text-red-700"
    : days <= 7
    ? "bg-orange-50 text-orange-700"
    : "bg-[#F3F4F6] text-[#6B7280]";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}>
      {days}d left
    </span>
  );
}

function RoleChip({ role }: { role: string }) {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    platform_admin: "Platform Admin",
    sp_admin: "SP Admin",
  };
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-[#4A6FA5]">
      {labels[role] ?? role}
    </span>
  );
}

function RowActions({ onRestore, onPurge }: { onRestore: () => Promise<void>; onPurge: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"restore" | "purge" | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setError(null);
    setBusy("restore");
    try { await onRestore(); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to restore."); }
    finally { setBusy(null); }
  }

  async function handlePurge() {
    if (!confirmPurge) { setConfirmPurge(true); return; }
    setError(null);
    setBusy("purge");
    try { await onPurge(); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete."); }
    finally { setBusy(null); setConfirmPurge(false); }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={handleRestore} disabled={!!busy} title="Restore item"
          className="p-1.5 rounded hover:bg-[#EEF2FF] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] disabled:opacity-50 inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        {confirmPurge ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-red-600 font-medium">Sure?</span>
            <button onClick={handlePurge} disabled={!!busy}
              className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50">
              {busy === "purge" ? "…" : "Yes"}
            </button>
            <button onClick={() => setConfirmPurge(false)} className="px-1.5 py-1 text-xs text-[#6B7280] hover:text-[#1A1A2E]">
              No
            </button>
          </div>
        ) : (
          <button onClick={handlePurge} disabled={!!busy}
            className="px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
            Delete permanently
          </button>
        )}
      </div>
      {error && (
        <span role="alert" title={error} className="text-xs text-[#DC2626] font-medium max-w-[200px] truncate">{error}</span>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between hover:bg-[#F8F9FA] transition text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1A1A2E]">{title}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F3F4F6] text-[#6B7280]">
            {count}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-[#9CA3AF] transition-transform ${open ? "" : "-rotate-90"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        count === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[#9CA3AF]">Nothing here.</div>
        ) : (
          children
        )
      )}
    </div>
  );
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  deleted_at: string;
  organization: { name: string } | null;
}

interface MasterRecord {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  deleted_at: string;
}

interface Provider {
  id: string;
  name: string;
  business_type?: string;
  city?: string;
  deleted_at: string;
}

interface Client {
  id: string;
  name: string;
  business_type?: string;
  city?: string;
  deleted_at: string;
}

interface Props {
  users: User[];
  masters: MasterRecord[];
  providers: Provider[];
  clients: Client[];
}

export default function PlatformRecycleBinClient({ users, masters, providers, clients }: Props) {
  const total = users.length + masters.length + providers.length + clients.length;

  if (total === 0) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm px-8 py-16 text-center">
        <svg className="w-10 h-10 text-[#D1D5DB] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <p className="text-sm font-medium text-[#6B7280]">Recycle Bin is empty</p>
        <p className="text-xs text-[#9CA3AF] mt-1">Deleted platform items appear here for 30 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Service Providers" count={providers.length}>
        <div className="divide-y divide-[#F3F4F6]">
          {providers.map((p) => (
            <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1A1A2E] truncate">{p.name}</p>
                <p className="text-xs text-[#6B7280] truncate">
                  {[p.business_type, p.city].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-xs text-[#9CA3AF]">Deleted {fmtDate(p.deleted_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <DaysChip deletedAt={p.deleted_at} />
                <RowActions
                  onRestore={() => restoreProvider(p.id)}
                  onPurge={() => purgeProvider(p.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Clients" count={clients.length}>
        <div className="divide-y divide-[#F3F4F6]">
          {clients.map((c) => (
            <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1A1A2E] truncate">{c.name}</p>
                <p className="text-xs text-[#6B7280] truncate">
                  {[c.business_type, c.city].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-xs text-[#9CA3AF]">Deleted {fmtDate(c.deleted_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <DaysChip deletedAt={c.deleted_at} />
                <RowActions
                  onRestore={() => restoreClient(c.id)}
                  onPurge={() => purgeClient(c.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Users" count={users.length}>
        <div className="divide-y divide-[#F3F4F6]">
          {users.map((u) => (
            <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[#1A1A2E] truncate">
                    {u.first_name} {u.last_name}
                  </p>
                  <RoleChip role={u.role} />
                </div>
                <p className="text-xs text-[#6B7280] truncate">{u.email}</p>
                <p className="text-xs text-[#9CA3AF]">
                  {u.organization?.name ? `${u.organization.name} · ` : ""}Deleted {fmtDate(u.deleted_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <DaysChip deletedAt={u.deleted_at} />
                <RowActions
                  onRestore={() => restorePlatformUser(u.id)}
                  onPurge={() => purgePlatformUser(u.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Masters" count={masters.length}>
        <div className="divide-y divide-[#F3F4F6]">
          {masters.map((m) => (
            <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1A1A2E] truncate">{m.name}</p>
                <p className="text-xs text-[#6B7280] truncate capitalize">{m.type.replace(/_/g, " ")}</p>
                <p className="text-xs text-[#9CA3AF]">Deleted {fmtDate(m.deleted_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <DaysChip deletedAt={m.deleted_at} />
                <RowActions
                  onRestore={() => restoreMasterRecord(m.id)}
                  onPurge={() => purgeMasterRecord(m.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
