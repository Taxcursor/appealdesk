"use client";

import { useState } from "react";
import { fetchGstTaxpayerInfo, type GstTaxpayerInfo } from "@/lib/whitebooks/gst-public";

interface Props {
  gstin: string;
}

function formatAddress(addr?: GstTaxpayerInfo["pradr"]): string {
  if (!addr?.addr) return "—";
  const a = addr.addr;
  return [a.bno, a.bnm, a.flno, a.st, a.loc, a.dst, a.stcd, a.pncd]
    .filter(Boolean)
    .join(", ");
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const styles =
    s === "active"
      ? "bg-green-50 text-[#16A34A] border-green-100"
      : s === "suspended"
      ? "bg-yellow-50 text-[#D97706] border-yellow-100"
      : "bg-red-50 text-[#DC2626] border-red-100";
  return (
    <span className={`text-xs font-medium border rounded px-2 py-0.5 ${styles}`}>
      {status}
    </span>
  );
}

function Row({ label, value }: { label: string; value?: string | string[] | null }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="grid grid-cols-5 gap-2 py-2 border-b border-[#F3F4F6] last:border-0">
      <dt className="col-span-2 text-xs font-medium text-[#6B7280] uppercase tracking-wide leading-5">
        {label}
      </dt>
      <dd className="col-span-3 text-sm text-[#1A1A2E]">
        {Array.isArray(value) ? value.join(", ") : value}
      </dd>
    </div>
  );
}

export default function GstFetchButton({ gstin }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GstTaxpayerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setData(null);
    setOpen(true);

    const result = await fetchGstTaxpayerInfo(gstin);
    if (result.success) {
      setData(result.data);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={handleFetch}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg transition"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Fetch GST Info
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[#E5E7EB]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div>
                <h2 className="text-base font-semibold text-[#1A1A2E]">GST Taxpayer Info</h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">{gstin}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#9CA3AF] hover:text-[#1A1A2E] transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading && (
                <div className="flex items-center justify-center gap-3 py-12 text-[#6B7280]">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-sm">Fetching from GST portal…</span>
                </div>
              )}

              {error && !loading && (
                <div className="text-sm text-[#DC2626] bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {data && !loading && (
                <div>
                  {/* Name + status banner */}
                  <div className="mb-5 pb-4 border-b border-[#E5E7EB]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-[#1A1A2E]">{data.lgnm}</p>
                        {data.tradeNam && data.tradeNam !== data.lgnm && (
                          <p className="text-sm text-[#6B7280] mt-0.5">Trade name: {data.tradeNam}</p>
                        )}
                      </div>
                      {data.sts && <StatusBadge status={data.sts} />}
                    </div>
                  </div>

                  {/* Details */}
                  <dl>
                    <Row label="GSTIN" value={data.gstin} />
                    <Row label="Taxpayer Type" value={data.dty} />
                    <Row label="Constitution" value={data.ctb} />
                    <Row label="Registered On" value={data.rgdt} />
                    <Row label="Last Updated" value={data.lstupdt} />
                    <Row label="State Jurisdiction" value={data.stj} />
                    <Row label="Centre Jurisdiction" value={data.ctj} />
                    <Row label="E-Invoice" value={data.einvoiceStatus} />
                    <Row label="Business Activities" value={data.nba} />
                    <Row label="Principal Address" value={formatAddress(data.pradr)} />
                  </dl>

                  {data.adadr && data.adadr.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
                      <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-2">
                        Additional Places of Business
                      </p>
                      <ul className="space-y-1">
                        {data.adadr.map((a, i) => (
                          <li key={i} className="text-sm text-[#1A1A2E]">
                            {formatAddress(a)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-[#9CA3AF] mt-4">
                    Source: GST Portal via Whitebooks · Fetched {new Date().toLocaleString("en-IN")}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {!loading && (
              <div className="px-6 py-3 border-t border-[#E5E7EB] flex justify-end">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
