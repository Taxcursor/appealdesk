"use client";

import { useMemo, useState } from "react";
import GuestProceedingCard, { GuestProceedingSummary } from "@/components/sp/GuestProceedingCard";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-white text-blue-700" },
  closed: { label: "Closed", cls: "bg-white text-gray-500" },
};

function LitigationDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs mb-0.5 text-white/70" style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}>
        {label}
      </p>
      <p className="text-sm text-white" style={{ textShadow: "0 0 8px rgba(0,0,0,0.7)" }}>
        {value || "—"}
      </p>
    </div>
  );
}

export default function GuestProceedingsClient({
  proceedings,
  canEdit,
}: {
  proceedings: GuestProceedingSummary[];
  canEdit: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group assigned proceedings by their parent litigation, so each
  // litigation's context is shown once, with its assigned proceeding(s)
  // nested underneath — same structure as the staff Litigation detail page.
  const groups = useMemo(() => {
    const map = new Map<string, { appeal: GuestProceedingSummary["appeal"]; items: GuestProceedingSummary[] }>();
    for (const p of proceedings) {
      const key = p.appeal?.id ?? "unknown";
      if (!map.has(key)) map.set(key, { appeal: p.appeal, items: [] });
      map.get(key)!.items.push(p);
    }
    return Array.from(map.values());
  }, [proceedings]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-heading">My Proceedings</h1>
        <p className="text-secondary text-sm mt-0.5">
          {canEdit ? "Proceedings assigned to you — view, edit, or delete." : "Proceedings assigned to you (view only)."}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted">
          No proceedings are currently assigned to you.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ appeal, items }) => {
            const statusCfg = STATUS_CFG[appeal?.status ?? "open"];
            return (
              <div key={appeal?.id ?? items[0]?.id} className="space-y-3">
                {/* Litigation header — read-only, same visual language as the
                    staff Litigation detail page's Appeal Header. */}
                <div
                  className="rounded-xl shadow-sm overflow-hidden"
                  style={{ background: "linear-gradient(to right, #363636 0%, #696969 100%)" }}
                >
                  <div className="grid grid-cols-2 md:grid-cols-5 items-center gap-4 px-6 py-5">
                    <LitigationDetailRow label="Client" value={<span className="font-medium">{appeal?.client_org?.name}</span>} />
                    <LitigationDetailRow label="Act / Regulation" value={appeal?.act_regulation?.name} />
                    <LitigationDetailRow label="Financial Year" value={appeal?.financial_year?.name} />
                    <LitigationDetailRow label="Assessment Year" value={appeal?.assessment_year?.name} />
                    <div className="flex items-center justify-between gap-4">
                      <LitigationDetailRow label="Litigation Type" value={appeal?.litigation_type?.name} />
                      {statusCfg && (
                        <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.cls}`}>
                          {statusCfg.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Proceeding cards for this litigation */}
                <div className="flex flex-col gap-3">
                  {items.map((p) => (
                    <GuestProceedingCard
                      key={p.id}
                      proceeding={p}
                      canEdit={canEdit}
                      expanded={expandedId === p.id}
                      onToggle={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
