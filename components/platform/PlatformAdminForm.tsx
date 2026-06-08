"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { createPlatformAdmin, AdminInput } from "@/app/(platform)/platform/admins/actions";
import { INDIAN_STATES } from "@/lib/constants";

const inp = "w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-[#6B7280] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function FileUploadField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `user-docs/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
      onChange(urlData.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[#6B7280] mb-1.5">{label} (Attachment)</label>
      {value ? (
        <div className="flex items-center gap-2">
          <a href={value} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#4A6FA5] hover:underline truncate max-w-[200px]">
            View uploaded file
          </a>
          <button type="button" onClick={() => onChange("")}
            className="text-xs text-red-500 hover:text-red-700">Remove</button>
        </div>
      ) : (
        <label className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          {uploading ? "Uploading…" : "Upload File"}
          <input type="file" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>
      )}
    </div>
  );
}

function AvatarUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `user-avatars/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
      onChange(urlData.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div className="col-span-2 flex items-center gap-4 pb-4 border-b border-[#F3F4F6] mb-2">
      <div className="relative flex-shrink-0">
        {value ? (
          <Image src={value} alt="Avatar" width={64} height={64} className="w-16 h-16 rounded-full object-cover border-2 border-[#E5E7EB]" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#F3F4F6] border-2 border-dashed border-[#D1D5DB] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-[#6B7280] mb-1.5">Profile Photo</p>
        <label className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {uploading ? "Uploading…" : value ? "Change Photo" : "Upload Photo"}
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>
        {value && (
          <button type="button" onClick={() => onChange("")}
            className="ml-2 text-xs text-red-500 hover:text-red-700">Remove</button>
        )}
        <p className="text-xs text-[#9CA3AF] mt-1">JPG, PNG · shown in sidebar</p>
      </div>
    </div>
  );
}

const BLANK: AdminInput = {
  first_name: "", middle_name: "", last_name: "",
  email: "",
  password: "",
  role: "platform_admin",
  mobile_country_code: "+91", mobile_number: "",
  date_of_birth: "",
  department: "", designation: "",
  date_of_joining: "", date_of_leaving: "",
  address_line1: "", address_line2: "", city: "", pin_code: "", location: "", country: "India",
  pan_number: "", pan_attachment: "",
  aadhar_number: "", aadhar_attachment: "",
  avatar_url: "",
};

export default function PlatformAdminForm() {
  const [form, setForm] = useState<AdminInput>(BLANK);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [locationOther, setLocationOther] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof AdminInput) => (val: string) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) { setError("First name is required."); return; }
    if (!form.last_name.trim()) { setError("Last name is required."); return; }
    if (!form.email.trim()) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    setError(null);
    try {
      await createPlatformAdmin({ ...form, password });
      window.location.href = "/platform/users";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create admin.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Basic Information */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1A1A2E] mb-4 pb-3 border-b border-[#E5E7EB]">Basic Information</h2>
        <div className="grid grid-cols-2 gap-4">

          <AvatarUpload value={form.avatar_url ?? ""} onChange={set("avatar_url")} />

          <div className="col-span-2 grid grid-cols-3 gap-3">
            <Field label="First Name" required>
              <input value={form.first_name} onChange={(e) => set("first_name")(e.target.value)} className={inp} />
            </Field>
            <Field label="Middle Name">
              <input value={form.middle_name ?? ""} onChange={(e) => set("middle_name")(e.target.value)} placeholder="Optional" className={inp} />
            </Field>
            <Field label="Last Name" required>
              <input value={form.last_name} onChange={(e) => set("last_name")(e.target.value)} className={inp} />
            </Field>
          </div>

          <Field label="Mobile">
            <div className="flex gap-2">
              <div className="flex items-center border-2 border-[#4A6FA5] rounded-lg overflow-hidden flex-shrink-0 w-24 focus-within:ring-2 focus-within:ring-[#1E3A5F]">
                <span className="px-2 py-2 text-sm text-[#6B7280] bg-[#F3F4F6] border-r border-[#4A6FA5] select-none">+</span>
                <input type="text" inputMode="numeric"
                  value={(form.mobile_country_code ?? "+91").replace(/^\+/, "")}
                  onChange={(e) => set("mobile_country_code")("+" + e.target.value.replace(/\D/g, ""))}
                  placeholder="91"
                  className="w-full px-2 py-2 text-sm focus:outline-none bg-white" />
              </div>
              <input type="tel" value={form.mobile_number ?? ""} onChange={(e) => set("mobile_number")(e.target.value)}
                placeholder="10-digit number" className={inp} />
            </div>
          </Field>

          <Field label="Email" required>
            <input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} className={inp} />
          </Field>

          <Field label="Password" required>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters" className={inp} autoComplete="new-password" />
              <EyeBtn visible={showPassword} toggle={() => setShowPassword(!showPassword)} />
            </div>
          </Field>
          <Field label="Confirm Password" required>
            <div className="relative">
              <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password" className={inp} autoComplete="new-password" />
              <EyeBtn visible={showConfirmPassword} toggle={() => setShowConfirmPassword(!showConfirmPassword)} />
            </div>
          </Field>

          <Field label="Date of Birth">
            <input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth")(e.target.value)} className={inp} />
          </Field>

          <Field label="Role" required>
            <select value={form.role} onChange={(e) => set("role")(e.target.value as AdminInput["role"])} className={inp}>
              <option value="platform_admin">Platform Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </Field>

        </div>
      </section>

      {/* Employment Details */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1A1A2E] mb-4 pb-3 border-b border-[#E5E7EB]">Employment Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Department">
            <input value={form.department ?? ""} onChange={(e) => set("department")(e.target.value)} placeholder="e.g. Operations, Tech" className={inp} />
          </Field>
          <Field label="Designation">
            <input value={form.designation ?? ""} onChange={(e) => set("designation")(e.target.value)} placeholder="e.g. Manager, Admin, Director" className={inp} />
          </Field>
          <Field label="Date of Joining">
            <input type="date" value={form.date_of_joining ?? ""} onChange={(e) => set("date_of_joining")(e.target.value)} className={inp} />
          </Field>
          <Field label="Date of Leaving">
            <input type="date" value={form.date_of_leaving ?? ""} onChange={(e) => set("date_of_leaving")(e.target.value)} className={inp} />
          </Field>
        </div>
      </section>

      {/* Address */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1A1A2E] mb-4 pb-3 border-b border-[#E5E7EB]">Address</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Address Line 1" full>
            <input value={form.address_line1 ?? ""} onChange={(e) => set("address_line1")(e.target.value)} placeholder="Street / Building" className={inp} />
          </Field>
          <Field label="Address Line 2" full>
            <input value={form.address_line2 ?? ""} onChange={(e) => set("address_line2")(e.target.value)} placeholder="Area / Landmark" className={inp} />
          </Field>
          <Field label="City">
            <input value={form.city ?? ""} onChange={(e) => set("city")(e.target.value)} className={inp} />
          </Field>
          <Field label="State">
            <select
              value={locationOther ? "Other" : (form.location ?? "")}
              onChange={(e) => {
                if (e.target.value === "Other") { setLocationOther(true); set("location")(""); }
                else { setLocationOther(false); set("location")(e.target.value); }
              }}
              className={inp}
            >
              <option value="">Select state / UT</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="Other">Other (specify)</option>
            </select>
            {locationOther && (
              <input value={form.location ?? ""} onChange={(e) => set("location")(e.target.value)} placeholder="Enter state / UT name" className={`${inp} mt-2`} />
            )}
          </Field>
          <Field label="PIN Code">
            <input value={form.pin_code ?? ""} onChange={(e) => set("pin_code")(e.target.value)} maxLength={10} className={inp} />
          </Field>
          <Field label="Country">
            <input value={form.country ?? "India"} onChange={(e) => set("country")(e.target.value)} className={inp} />
          </Field>
        </div>
      </section>

      {/* Identity Documents */}
      <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1A1A2E] mb-4 pb-3 border-b border-[#E5E7EB]">Identity Documents</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PAN Number">
            <input value={form.pan_number ?? ""} onChange={(e) => set("pan_number")(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F" maxLength={10} className={inp} />
          </Field>
          <FileUploadField label="PAN" value={form.pan_attachment ?? ""} onChange={set("pan_attachment")} />
          <Field label="Aadhar Number">
            <input value={form.aadhar_number ?? ""} onChange={(e) => set("aadhar_number")(e.target.value)}
              placeholder="XXXX XXXX XXXX" maxLength={14} className={inp} />
          </Field>
          <FileUploadField label="Aadhar" value={form.aadhar_attachment ?? ""} onChange={set("aadhar_attachment")} />
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3">
        <button type="button" onClick={() => window.location.href = "/platform/users"}
          className="px-5 py-2.5 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
          {saving ? "Creating admin…" : "Create Admin"}
        </button>
      </div>
    </form>
  );
}
