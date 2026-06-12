"use client";

import { useState } from "react";
import { saveSpApiSettings, testGstPublicSearch, type SpApiSettingsInput } from "@/app/(sp)/settings/actions";
import type { GstTaxpayerInfo } from "@/lib/whitebooks/gst-public";

interface Props {
  initial: SpApiSettingsInput | null;
  isAdmin: boolean;
}

function EyeBtn({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280] transition">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {visible ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        ) : (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </>
        )}
      </svg>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | string[] | null }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="grid grid-cols-5 gap-2 py-2 border-b border-[#F3F4F6] last:border-0">
      <dt className="col-span-2 text-xs font-medium text-[#6B7280] uppercase tracking-wide leading-5">{label}</dt>
      <dd className="col-span-3 text-sm text-[#1A1A2E]">
        {Array.isArray(value) ? value.join(", ") : value}
      </dd>
    </div>
  );
}

function formatAddress(pradr?: GstTaxpayerInfo["pradr"]): string {
  if (!pradr?.addr) return "";
  const a = pradr.addr;
  return [a.bno, a.bnm, a.flno, a.st, a.loc, a.dst, a.stcd, a.pncd].filter(Boolean).join(", ");
}

const DEFAULT_BASE_URL = "https://apisandbox.whitebooks.in";

export default function SpApiSettingsClient({ initial, isAdmin }: Props) {
  const ro = !isAdmin;
  const fieldClass = `w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] ${ro ? "bg-[#F8F9FA] text-[#6B7280] cursor-not-allowed" : ""}`;

  // ── Credentials form state ──────────────────────────────────────────────────
  const [clientId, setClientId] = useState(initial?.whitebooks_client_id ?? "");
  const [clientSecret, setClientSecret] = useState(initial?.whitebooks_client_secret ?? "");
  const [gstUsername, setGstUsername] = useState(initial?.whitebooks_gst_username ?? "");
  const [email, setEmail] = useState(initial?.whitebooks_email ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.whitebooks_base_url ?? DEFAULT_BASE_URL);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Test panel state ────────────────────────────────────────────────────────
  const [testGstin, setTestGstin] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GstTaxpayerInfo | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<Record<string, unknown> | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveSpApiSettings({
        whitebooks_client_id: clientId,
        whitebooks_client_secret: clientSecret,
        whitebooks_gst_username: gstUsername,
        whitebooks_email: email,
        whitebooks_base_url: baseUrl,
      });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testGstin.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    setTestLog(null);
    setShowLogs(false);
    try {
      const result = await testGstPublicSearch(
        testGstin.trim().toUpperCase(),
        clientId.trim(),
        clientSecret.trim(),
        email.trim(),
        baseUrl.trim() || DEFAULT_BASE_URL
      );
      if (result.success && result.data) {
        setTestResult(result.data as unknown as GstTaxpayerInfo);
      } else {
        setTestError(result.error ?? "Unknown error.");
        setTestLog({
          url: `${baseUrl.trim() || DEFAULT_BASE_URL}/public/search?email=${email.trim()}&gstin=${testGstin.trim().toUpperCase()}`,
          error: result.error,
          rawResponse: result.rawResponse ?? null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed.";
      setTestError(msg);
      setTestLog({ error: msg });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm mt-8 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-[#E5E7EB]">
        <h2 className="text-base font-semibold text-[#1A1A2E]">API Integrations</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Whitebooks GST API credentials for fetching notices from the GST portal.
        </p>
      </div>

      {/* ── Credentials form ── */}
      <form onSubmit={handleSave} className="px-6 py-5 space-y-5 border-b border-[#E5E7EB]">
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={ro}
            placeholder={DEFAULT_BASE_URL}
            className={fieldClass}
          />
          <p className="text-xs text-[#9CA3AF] mt-1">
            Sandbox: https://apisandbox.whitebooks.in · Production: https://api.whitebooks.in
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={ro}
              placeholder="GSTS…"
              className={fieldClass}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={ro}
                placeholder="GSTS…"
                className={`${fieldClass} pr-9`}
                autoComplete="new-password"
              />
              <EyeBtn visible={showSecret} onClick={() => setShowSecret((v) => !v)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">GST Username</label>
            <input
              type="text"
              value={gstUsername}
              onChange={(e) => setGstUsername(e.target.value)}
              disabled={ro}
              placeholder="TN_NT2.XXXXXX"
              className={fieldClass}
              autoComplete="off"
            />
            <p className="text-xs text-[#9CA3AF] mt-1">GST portal login username registered with Whitebooks</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={ro}
              placeholder="you@example.com"
              className={fieldClass}
            />
            <p className="text-xs text-[#9CA3AF] mt-1">ASP-registered email with Whitebooks</p>
          </div>
        </div>

        {!ro && (
          <>
            {saveError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{saveError}</div>
            )}
            {saveSuccess && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                API settings saved successfully.
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save API Settings"}
              </button>
            </div>
          </>
        )}
      </form>

      {/* ── Test API Connection ── */}
      <div className="px-6 py-5">
        <p className="text-sm font-medium text-[#1A1A2E] mb-1">Test API Connection</p>
        <p className="text-xs text-[#6B7280] mb-4">
          Enter any valid GSTIN to verify your credentials are working correctly.
        </p>

        <form onSubmit={handleTest} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[#6B7280] mb-1.5">GSTIN</label>
            <input
              type="text"
              value={testGstin}
              onChange={(e) => { setTestGstin(e.target.value.toUpperCase()); setTestResult(null); setTestError(null); setTestLog(null); setShowLogs(false); }}
              placeholder="e.g. 27AAACR5055K1Z7"
              maxLength={15}
              className="w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] font-mono tracking-wide"
              required
            />
          </div>
          <button
            type="submit"
            disabled={testing || !testGstin.trim()}
            className="px-5 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
          >
            {testing ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Testing…
              </>
            ) : "Test Connection"}
          </button>
        </form>

        {/* ── Failed banner ── */}
        {testError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-[#DC2626] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-[#DC2626]">Connection Failed</span>
            </div>
            {testLog && (
              <button
                type="button"
                onClick={() => setShowLogs((v) => !v)}
                className="text-xs text-[#DC2626] underline underline-offset-2 whitespace-nowrap shrink-0"
              >
                {showLogs ? "Hide Logs" : "View Logs"}
              </button>
            )}
          </div>
        )}

        {/* ── Logs panel ── */}
        {testError && showLogs && testLog && (
          <div className="mt-2 rounded-lg border border-[#E5E7EB] bg-[#1A1A2E] text-green-400 text-xs font-mono p-4 overflow-x-auto">
            <p className="text-[#9CA3AF] mb-2 font-sans">— Diagnostic Log —</p>
            {testLog.url ? (
              <p className="mb-2">
                <span className="text-[#6B7280]">URL: </span>
                <span className="break-all">{String(testLog.url)}</span>
              </p>
            ) : null}
            <p className="mb-2">
              <span className="text-[#6B7280]">Error: </span>
              <span className="text-red-400">{String(testLog.error ?? "")}</span>
            </p>
            {testLog.rawResponse ? (
              <>
                <p className="text-[#6B7280] mb-1">Raw Response:</p>
                <pre className="whitespace-pre-wrap break-all text-green-300">
                  {JSON.stringify(testLog.rawResponse, null, 2)}
                </pre>
              </>
            ) : null}
          </div>
        )}

        {/* ── Success banner + details ── */}
        {testResult && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#16A34A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-[#16A34A]">Connection Successful</span>
              <span
                className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded border ${
                  testResult.sts?.toLowerCase() === "active"
                    ? "bg-green-100 text-[#16A34A] border-green-200"
                    : testResult.sts?.toLowerCase() === "suspended"
                    ? "bg-yellow-50 text-[#D97706] border-yellow-200"
                    : "bg-red-50 text-[#DC2626] border-red-200"
                }`}
              >
                {testResult.sts}
              </span>
            </div>

            <div className="rounded-lg border border-[#E5E7EB] px-4 py-4">
              <p className="text-sm font-semibold text-[#1A1A2E]">{testResult.lgnm}</p>
              {testResult.tradeNam && testResult.tradeNam !== testResult.lgnm && (
                <p className="text-xs text-[#6B7280] mt-0.5">Trade name: {testResult.tradeNam}</p>
              )}
              <dl className="mt-3">
                <InfoRow label="GSTIN" value={testResult.gstin} />
                <InfoRow label="Taxpayer Type" value={testResult.dty} />
                <InfoRow label="Constitution" value={testResult.ctb} />
                <InfoRow label="Registered On" value={testResult.rgdt} />
                <InfoRow label="Last Updated" value={testResult.lstupdt} />
                <InfoRow label="State Jurisdiction" value={testResult.stj} />
                <InfoRow label="Centre Jurisdiction" value={testResult.ctj} />
                <InfoRow label="Business Activities" value={testResult.nba} />
                <InfoRow label="E-Invoice" value={testResult.einvoiceStatus} />
                <InfoRow label="Principal Address" value={formatAddress(testResult.pradr)} />
              </dl>
            </div>
          </div>
        )}
      </div>

    </section>
  );
}
