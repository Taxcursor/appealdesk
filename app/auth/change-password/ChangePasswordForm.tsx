"use client";

import { useState } from "react";
import { changePassword } from "./actions";

const inp = "w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

function EyeBtn({ visible, toggle }: { visible: boolean; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {visible
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
        }
      </svg>
    </button>
  );
}

export default function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    setError(null);
    try {
      const redirectTo = await changePassword(password);
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-xs font-medium text-[#6B7280] mb-1.5">
          New Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input type={showPassword ? "text" : "password"} value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters" className={inp} autoComplete="new-password" />
          <EyeBtn visible={showPassword} toggle={() => setShowPassword(!showPassword)} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#6B7280] mb-1.5">
          Confirm Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password" className={inp} autoComplete="new-password" />
          <EyeBtn visible={showConfirmPassword} toggle={() => setShowConfirmPassword(!showConfirmPassword)} />
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="w-full px-5 py-2.5 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
        {saving ? "Saving…" : "Set Password & Continue"}
      </button>
    </form>
  );
}
