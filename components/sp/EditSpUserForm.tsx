"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { updateUser, UserEditInput } from "@/app/(sp)/users/actions";
import { INDIAN_STATES } from "@/lib/constants";

const inp = "w-full px-3 py-2 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";

function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-secondary mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
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
    <div className="col-span-2 flex items-center gap-4 pb-4 border-b border-surface-hover mb-2">
      <div className="flex-shrink-0">
        {value ? (
          <Image src={value} alt="Avatar" width={64} height={64} className="w-16 h-16 rounded-full object-cover border-2 border-border" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-surface-hover border-2 border-dashed border-border-strong flex items-center justify-center">
            <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-secondary mb-1.5">Profile Photo</p>
        <label className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-border rounded-lg text-secondary hover:bg-page transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
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
        <p className="text-xs text-muted mt-1">JPG, PNG · shown in sidebar</p>
      </div>
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
      <label className="block text-xs font-medium text-secondary mb-1.5">{label} (Attachment)</label>
      <div className="flex items-center gap-0.5">
        {value && (
          <a href={value} target="_blank" rel="noopener noreferrer" title="View attachment"
            className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </a>
        )}
        <label title={value ? "Replace attachment" : "Upload attachment"}
          className={`cursor-pointer p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading
            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          }
          <input type="file" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>
        {value && (
          <button type="button" onClick={() => onChange("")} title="Remove attachment"
            className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

interface UserData {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  role: string;
  mobile_country_code: string | null;
  mobile_number: string | null;
  date_of_birth: string | null;
  avatar_url: string | null;
  designation: string | null;
  department: string | null;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  pin_code: string | null;
  location: string | null;
  country: string | null;
  pan_number: string | null;
  pan_attachment: string | null;
  aadhar_number: string | null;
  aadhar_attachment: string | null;
}

interface Props {
  user: UserData;
}

export default function EditSpUserForm({ user }: Props) {
  const [form, setForm] = useState<UserEditInput>({
    first_name: user.first_name,
    middle_name: user.middle_name ?? "",
    last_name: user.last_name,
    role: user.role as "sp_admin" | "sp_staff" | "director" | "guest_manager" | "guest_user",
    mobile_country_code: user.mobile_country_code ?? "+91",
    mobile_number: user.mobile_number ?? "",
    date_of_birth: user.date_of_birth ?? "",
    avatar_url: user.avatar_url ?? "",
    department: user.department ?? "",
    designation: user.designation ?? "",
    date_of_joining: user.date_of_joining ?? "",
    date_of_leaving: user.date_of_leaving ?? "",
    address_line1: user.address_line1 ?? "",
    address_line2: user.address_line2 ?? "",
    city: user.city ?? "",
    pin_code: user.pin_code ?? "",
    location: user.location ?? "",
    country: user.country ?? "India",
    pan_number: user.pan_number ?? "",
    pan_attachment: user.pan_attachment ?? "",
    aadhar_number: user.aadhar_number ?? "",
    aadhar_attachment: user.aadhar_attachment ?? "",
    new_password: "",
  });
  const [locationOther, setLocationOther] = useState(
    !INDIAN_STATES.includes(user.location ?? "") && (user.location ?? "") !== ""
  );
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof UserEditInput) => (val: string) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) { setError("First name is required."); return; }
    if (!form.last_name.trim()) { setError("Last name is required."); return; }
    if (form.new_password && form.new_password.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (form.new_password && form.new_password !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    setError(null);
    try {
      await updateUser(user.id, form);
      window.location.href = "/users";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Basic Information */}
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading mb-4 pb-3 border-b border-border">Basic Information</h2>
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

          <Field label="Email" full>
            <input type="email" value={user.email} disabled
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-page text-muted cursor-not-allowed" />
            <p className="text-xs text-muted mt-1">Email cannot be changed.</p>
          </Field>

          <Field label="Mobile">
            <div className="flex gap-2">
              <div className="flex items-center border border-accent rounded-lg overflow-hidden flex-shrink-0 w-24 focus-within:ring-1 focus-within:ring-primary">
                <span className="px-2 py-2 text-sm text-secondary bg-surface-hover border-r border-accent select-none">+</span>
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

          <Field label="Date of Birth">
            <input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth")(e.target.value)} className={inp} />
          </Field>

          <Field label="Role" required>
            <select value={form.role} onChange={(e) => set("role")(e.target.value as UserEditInput["role"])} className={inp}>
              <option value="sp_admin">Admin</option>
              <option value="sp_staff">Staff</option>
              <option value="director">Director</option>
              <option value="guest_manager">Guest Manager</option>
              <option value="guest_user">Guest User</option>
            </select>
          </Field>

          {/* Password reset — optional */}
          <Field label="New Password">
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={form.new_password ?? ""}
                onChange={(e) => set("new_password")(e.target.value)} placeholder="Leave blank to keep current"
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-9 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {showPassword
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
            </div>
          </Field>

          <Field label="Confirm New Password">
            <div className="relative">
              <input type={showConfirm ? "text" : "password"} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password"
                autoComplete="new-password"
                className={`w-full px-3 py-2 pr-9 text-sm border-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary ${confirmPassword && confirmPassword !== form.new_password ? "border-red-400" : "border-accent"}`} />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {showConfirm
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
            </div>
            {confirmPassword && confirmPassword !== form.new_password && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
            )}
          </Field>

        </div>
      </section>

      {/* Employment Details */}
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading mb-4 pb-3 border-b border-border">Employment Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Department">
            <input value={form.department ?? ""} onChange={(e) => set("department")(e.target.value)} placeholder="e.g. Tax, Audit" className={inp} />
          </Field>
          <Field label="Designation">
            <input value={form.designation ?? ""} onChange={(e) => set("designation")(e.target.value)} placeholder="e.g. CA, Manager" className={inp} />
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
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading mb-4 pb-3 border-b border-border">Address</h2>
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
      <section className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-heading mb-4 pb-3 border-b border-border">Identity Documents</h2>
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

      <div className="flex gap-3">
        <button type="button" onClick={() => window.location.href = "/users"}
          className="px-5 py-2.5 text-sm border border-border rounded-lg text-heading hover:bg-page transition">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
