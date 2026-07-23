"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createClientOrg, updateClientOrg, ComplianceInput } from "@/app/(sp)/clients/actions";
import { INDIAN_STATES } from "@/lib/constants";

// Fallback used only if master_records are not passed from the server
const BUSINESS_TYPES_FALLBACK = ["Company", "Trust", "Partnership", "LLP", "Sole Proprietorship", "OPC", "HUF", "Individual", "Custom"];
const FIXED_TYPES = ["pan", "aadhaar", "tan", "gst"];
const COMPLIANCE_TYPES = [
  { key: "pan", label: "PAN" },
  { key: "tan", label: "TAN" },
  { key: "gst", label: "GST" },
] as const;
const EXTRA_ID_TYPES = [
  "GST", "MSME / Udyam", "ESIC", "EPF / PF", "Professional Tax",
  "Shops & Establishment", "IEC", "FSSAI", "Trade License",
  "Passport", "Driving Licence", "Voter ID", "Other",
];

interface InitialCompliance {
  type: string;
  number?: string;
  login_id?: string;
  credential?: string;
  attachment_url?: string;
}

interface Props {
  mode: "create" | "edit";
  clientId?: string;
  initialData?: Record<string, string | null>;
  initialCompliance?: InitialCompliance[];
  readOnly?: boolean;
  businessTypes?: string[];
}

interface ComplianceState {
  number: string;
  login_id: string;
  credential: string;
  attachment_url: string;
  showCredential: boolean;
  uploading: boolean;
}

interface ExtraRow {
  rowId: string;
  type: string;
  number: string;
  login_id: string;
  credential: string;
  attachment_url: string;
  showCredential: boolean;
  uploading: boolean;
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
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
  );
}

export default function ClientForm({ mode, clientId, initialData, initialCompliance, readOnly = false, businessTypes }: Props) {
  const BUSINESS_TYPES = businessTypes?.length ? businessTypes : BUSINESS_TYPES_FALLBACK;
  const router = useRouter();

  const [name, setName] = useState(initialData?.name ?? "");
  const [fileNumber, setFileNumber] = useState(initialData?.file_number ?? "");
  const [businessType, setBusinessType] = useState(initialData?.business_type ?? "");
  const [dateOfIncorporation, setDateOfIncorporation] = useState(initialData?.date_of_incorporation ?? "");
  const [logoUrl, setLogoUrl] = useState(initialData?.logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [address1, setAddress1] = useState(initialData?.address_line1 ?? "");
  const [address2, setAddress2] = useState(initialData?.address_line2 ?? "");
  const [city, setCity] = useState(initialData?.city ?? "");
  const [state, setState] = useState(initialData?.state ?? "");
  const [pinCode, setPinCode] = useState(initialData?.pin_code ?? "");
  const [country, setCountry] = useState(initialData?.country ?? "India");
  const [stateOther, setStateOther] = useState(
    !INDIAN_STATES.includes(initialData?.state ?? "") && (initialData?.state ?? "") !== ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aadhaarInitial = initialCompliance?.find((c) => c.type === "aadhaar");
  const [aadhaarNumber, setAadhaarNumber] = useState(aadhaarInitial?.number ?? "");
  const [aadhaarAttachmentUrl, setAadhaarAttachmentUrl] = useState(aadhaarInitial?.attachment_url ?? "");
  const [aadhaarUploading, setAadhaarUploading] = useState(false);

  const [compliance, setCompliance] = useState<Record<string, ComplianceState>>(() => {
    const init: Record<string, ComplianceState> = {};
    COMPLIANCE_TYPES.forEach(({ key }) => {
      const existing = initialCompliance?.find((c) => c.type === key);
      init[key] = {
        number: existing?.number ?? "",
        login_id: existing?.login_id ?? "",
        credential: existing?.credential ?? "",
        attachment_url: existing?.attachment_url ?? "",
        showCredential: false,
        uploading: false,
      };
    });
    return init;
  });

  const [extraRows, setExtraRows] = useState<ExtraRow[]>(() =>
    (initialCompliance ?? [])
      .filter((c) => !FIXED_TYPES.includes(c.type))
      .map((c) => ({
        rowId: crypto.randomUUID(),
        type: c.type,
        number: c.number ?? "",
        login_id: c.login_id ?? "",
        credential: c.credential ?? "",
        attachment_url: c.attachment_url ?? "",
        showCredential: false,
        uploading: false,
      }))
  );

  function updateCompliance(type: string, field: keyof ComplianceState, value: string | boolean) {
    setCompliance((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  }

  function clearComplianceAttachment(type: string) {
    updateCompliance(type, "attachment_url", "");
  }

  function clearExtraAttachment(rowId: string) {
    updateExtraRow(rowId, "attachment_url", "");
  }

  function addExtraRow() {
    setExtraRows((prev) => [
      ...prev,
      { rowId: crypto.randomUUID(), type: EXTRA_ID_TYPES[0], number: "", login_id: "", credential: "", attachment_url: "", showCredential: false, uploading: false },
    ]);
  }

  function updateExtraRow(rowId: string, field: keyof ExtraRow, value: string | boolean) {
    setExtraRows((prev) => prev.map((r) => r.rowId === rowId ? { ...r, [field]: value } : r));
  }

  function removeExtraRow(rowId: string) {
    setExtraRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  async function uploadFile(file: File, path: string): Promise<string | null> {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("org-files")
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const url = await uploadFile(file, `logos/${Date.now()}-${file.name}`);
    if (url) setLogoUrl(url);
    setLogoUploading(false);
  }

  async function handleAadhaarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAadhaarUploading(true);
    const url = await uploadFile(file, `compliance/aadhaar/${Date.now()}-${file.name}`);
    if (url) setAadhaarAttachmentUrl(url);
    setAadhaarUploading(false);
  }

  async function handleAttachmentUpload(type: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    updateCompliance(type, "uploading", true);
    const url = await uploadFile(file, `compliance/${type}/${Date.now()}-${file.name}`);
    if (url) updateCompliance(type, "attachment_url", url);
    updateCompliance(type, "uploading", false);
  }

  async function handleExtraAttachmentUpload(rowId: string, type: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    updateExtraRow(rowId, "uploading", true);
    // eslint-disable-next-line react-hooks/purity
    const url = await uploadFile(file, `compliance/${type.replace(/\s+/g, "_")}/${Date.now()}-${file.name}`);
    if (url) updateExtraRow(rowId, "attachment_url", url);
    updateExtraRow(rowId, "uploading", false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Client name is required."); return; }

    setSaving(true);
    setError(null);

    const complianceInput: ComplianceInput[] = [
      ...COMPLIANCE_TYPES.map(({ key }) => ({
        type: key,
        number: compliance[key].number || undefined,
        login_id: compliance[key].login_id || undefined,
        credential: compliance[key].credential || undefined,
        attachment_url: compliance[key].attachment_url || undefined,
      })),
      ...(businessType === "Individual"
        ? [{
            type: "aadhaar",
            number: aadhaarNumber || undefined,
            attachment_url: aadhaarAttachmentUrl || undefined,
          }]
        : []),
      ...extraRows.map((r) => ({
        type: r.type,
        number: r.number || undefined,
        login_id: r.login_id || undefined,
        credential: r.credential || undefined,
        attachment_url: r.attachment_url || undefined,
      })),
    ];

    try {
      if (mode === "create") {
        await createClientOrg({
          name,
          file_number: fileNumber || undefined,
          business_type: businessType || undefined,
          date_of_incorporation: dateOfIncorporation || undefined,
          logo_url: logoUrl || undefined,
          address_line1: address1 || undefined,
          address_line2: address2 || undefined,
          city: city || undefined,
          state: state || undefined,
          pin_code: pinCode || undefined,
          country: country || undefined,
          compliance: complianceInput,
        });
      } else {
        await updateClientOrg(clientId!, {
          name,
          file_number: fileNumber || undefined,
          business_type: businessType || undefined,
          date_of_incorporation: dateOfIncorporation || undefined,
          logo_url: logoUrl || undefined,
          address_line1: address1 || undefined,
          address_line2: address2 || undefined,
          city: city || undefined,
          state: state || undefined,
          pin_code: pinCode || undefined,
          country: country || undefined,
          compliance: complianceInput,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  const fieldClass = `w-full px-3 py-2 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary ${readOnly ? "bg-page text-secondary cursor-not-allowed" : ""}`;
  const inp = `w-full px-2.5 py-1.5 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary ${readOnly ? "bg-page text-secondary cursor-not-allowed" : ""}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Basic Information */}
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading mb-4 pb-3 border-b border-border">Basic Information</h2>
        <div className="max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-secondary mb-1.5">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="e.g. ABC Pvt Ltd"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Client File Number</label>
            <input
              value={fileNumber}
              onChange={(e) => setFileNumber(e.target.value)}
              disabled={readOnly}

              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Business Type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              disabled={readOnly}
              className={fieldClass}
            >
              <option value="">Select type</option>
              {[...BUSINESS_TYPES].sort().map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Date of Incorporation</label>
            <input
              type="date"
              value={dateOfIncorporation}
              onChange={(e) => setDateOfIncorporation(e.target.value)}
              disabled={readOnly}
              className={fieldClass}
            />
          </div>
          {businessType === "Individual" && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Aadhar Number <span className="text-muted">(Optional)</span>
              </label>
              <input
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value)}
                disabled={readOnly}
                placeholder="XXXX XXXX XXXX"
                className={fieldClass}
              />
            </div>
          )}
          {!readOnly && (
            <div className={businessType === "Individual" ? "" : "col-span-2"}>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Logo <span className="text-muted">(JPG/PNG, max 2MB)</span>
              </label>
              <div className="flex items-center gap-4">
                {logoUrl && (
                  <Image src={logoUrl} alt="Logo" width={48} height={48} className="w-12 h-12 rounded-lg object-cover border border-border" />
                )}
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg text-secondary hover:bg-page transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {logoUploading ? "Uploading…" : logoUrl ? "Change Logo" : "Upload Logo"}
                  <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                </label>
              </div>
            </div>
          )}
          {businessType === "Individual" && !readOnly && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Attach Aadhar</label>
              <div className="flex items-center gap-4">
                {aadhaarAttachmentUrl && (
                  <a href={aadhaarAttachmentUrl} target="_blank" rel="noopener noreferrer" title="View attachment"
                    className="p-2 rounded-lg border border-border text-accent hover:text-primary hover:bg-page transition inline-flex">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </a>
                )}
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg text-secondary hover:bg-page transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {aadhaarUploading ? "Uploading…" : aadhaarAttachmentUrl ? "Change Aadhar" : "Upload Aadhar"}
                  <input type="file" accept=".pdf,image/jpeg,image/png" className="hidden" onChange={handleAadhaarUpload} disabled={aadhaarUploading} />
                </label>
              </div>
            </div>
          )}
          {readOnly && logoUrl && (
            <div className={businessType === "Individual" ? "" : "col-span-2"}>
              <label className="block text-xs font-medium text-secondary mb-1.5">Logo</label>
              <Image src={logoUrl} alt="Logo" width={64} height={64} className="w-16 h-16 rounded-lg object-cover border border-border" />
            </div>
          )}
          {businessType === "Individual" && readOnly && aadhaarAttachmentUrl && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Attach Aadhar</label>
              <a href={aadhaarAttachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-primary underline">
                View Aadhaar
              </a>
            </div>
          )}
        </div>
        </div>
      </section>

      {/* Address */}
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading mb-4 pb-3 border-b border-border">Address</h2>
        <div className="max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-secondary mb-1.5">Address Line 1 <span className="text-muted">(Building, Road)</span></label>
            <input value={address1} onChange={(e) => setAddress1(e.target.value)} disabled={readOnly} className={fieldClass} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-secondary mb-1.5">Address Line 2 <span className="text-muted">(Area, Locality)</span></label>
            <input value={address2} onChange={(e) => setAddress2(e.target.value)} disabled={readOnly} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} disabled={readOnly} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">State</label>
            <select
              value={stateOther ? "Other" : state}
              onChange={(e) => {
                if (e.target.value === "Other") { setStateOther(true); setState(""); }
                else { setStateOther(false); setState(e.target.value); }
              }}
              disabled={readOnly}
              className={fieldClass}
            >
              <option value="">Select state / UT</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="Other">Other (specify)</option>
            </select>
            {stateOther && !readOnly && (
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="Enter state / UT name" className={`${fieldClass} mt-2`} />
            )}
            {stateOther && readOnly && (
              <input value={state} disabled className={`${fieldClass} mt-2`} />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">PIN Code</label>
            <input value={pinCode} onChange={(e) => setPinCode(e.target.value)} maxLength={6} disabled={readOnly} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Country</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} disabled={readOnly} className={fieldClass} />
          </div>
        </div>
        </div>
      </section>

      {/* Compliance Details */}
      <section className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-heading">
            Compliance Details <span className="text-muted font-normal">(Optional)</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-page border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-secondary whitespace-nowrap w-40">ID Type</th>
                <th className="text-left px-4 py-3 font-medium text-secondary min-w-[180px]">ID</th>
                <th className="text-left px-4 py-3 font-medium text-secondary min-w-[180px]">Login ID</th>
                <th className="text-left px-4 py-3 font-medium text-secondary w-44">Password</th>
                <th className="text-left px-4 py-3 font-medium text-secondary w-36">Attachment</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Fixed rows */}
              {COMPLIANCE_TYPES.map(({ key, label }) => (
                <tr key={key} className="hover:bg-stripe">
                  <td className="px-4 py-3 font-medium text-heading whitespace-nowrap">{label}</td>
                  <td className="px-4 py-3">
                    <input value={compliance[key].number} onChange={(e) => updateCompliance(key, "number", e.target.value)} disabled={readOnly} placeholder={`${label} number`} className={inp} />
                  </td>
                  <td className="px-4 py-3">
                    <input value={compliance[key].login_id} onChange={(e) => updateCompliance(key, "login_id", e.target.value)} disabled={readOnly} placeholder="Login ID" className={inp} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <input type={compliance[key].showCredential ? "text" : "password"} value={compliance[key].credential} onChange={(e) => updateCompliance(key, "credential", e.target.value)} disabled={readOnly} placeholder="Password" autoComplete="new-password" className={`${inp} pr-8`} />
                      <button type="button" onClick={() => updateCompliance(key, "showCredential", !compliance[key].showCredential)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-secondary">
                        <EyeIcon visible={compliance[key].showCredential} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5">
                      {compliance[key].attachment_url && (
                        <a href={compliance[key].attachment_url} target="_blank" rel="noopener noreferrer" title="View attachment"
                          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </a>
                      )}
                      {!readOnly && (
                        <label title={compliance[key].attachment_url ? "Replace attachment" : "Upload attachment"}
                          className="cursor-pointer p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                          {compliance[key].uploading
                            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          }
                          <input type="file" accept=".pdf,image/jpeg,image/png" className="hidden" onChange={(e) => handleAttachmentUpload(key, e)} disabled={compliance[key].uploading} />
                        </label>
                      )}
                      {!readOnly && compliance[key].attachment_url && (
                        <button type="button" onClick={() => clearComplianceAttachment(key)} title="Remove attachment"
                          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                  <td />
                </tr>
              ))}

              {/* Extra rows */}
              {extraRows.map((row) => (
                <tr key={row.rowId} className="hover:bg-stripe">
                  <td className="px-4 py-3">
                    {readOnly ? (
                      <span className="font-medium text-heading">{row.type}</span>
                    ) : (
                      <select value={row.type} onChange={(e) => updateExtraRow(row.rowId, "type", e.target.value)} className={`${inp} text-xs`}>
                        {[...EXTRA_ID_TYPES].sort().map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <input value={row.number} onChange={(e) => updateExtraRow(row.rowId, "number", e.target.value)} disabled={readOnly} placeholder="ID number" className={inp} />
                  </td>
                  <td className="px-4 py-3">
                    <input value={row.login_id} onChange={(e) => updateExtraRow(row.rowId, "login_id", e.target.value)} disabled={readOnly} placeholder="Login ID" className={inp} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <input type={row.showCredential ? "text" : "password"} value={row.credential} onChange={(e) => updateExtraRow(row.rowId, "credential", e.target.value)} disabled={readOnly} placeholder="Password" autoComplete="new-password" className={`${inp} pr-8`} />
                      <button type="button" onClick={() => updateExtraRow(row.rowId, "showCredential", !row.showCredential)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-secondary">
                        <EyeIcon visible={row.showCredential} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5">
                      {row.attachment_url && (
                        <a href={row.attachment_url} target="_blank" rel="noopener noreferrer" title="View attachment"
                          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </a>
                      )}
                      {!readOnly && (
                        <label title={row.attachment_url ? "Replace attachment" : "Upload attachment"}
                          className="cursor-pointer p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                          {row.uploading
                            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          }
                          <input type="file" accept=".pdf,image/jpeg,image/png" className="hidden" onChange={(e) => handleExtraAttachmentUpload(row.rowId, row.type, e)} disabled={row.uploading} />
                        </label>
                      )}
                      {!readOnly && row.attachment_url && (
                        <button type="button" onClick={() => clearExtraAttachment(row.rowId)} title="Remove attachment"
                          className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    {!readOnly && (
                      <button type="button" onClick={() => removeExtraRow(row.rowId)} className="text-muted hover:text-red-500 transition" title="Remove row">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Add Row */}
              {!readOnly && (
                <tr className="bg-stripe">
                  <td colSpan={6} className="px-4 py-2.5">
                    <button type="button" onClick={addExtraRow} className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-primary transition font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Row
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Actions */}
      {!readOnly && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/clients")}
            className="px-5 py-2.5 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "create" ? "Add Client" : "Save Changes"}
          </button>
        </div>
      )}

      {readOnly && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/clients")}
            className="px-5 py-2.5 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
          >
            Back to Clients
          </button>
        </div>
      )}
    </form>
  );
}
