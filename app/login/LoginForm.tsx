"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

interface Props {
  platformName: string;
  description: string | null;
  logoUrl: string | null;
  supportEmail: string | null;
}

export default function LoginForm({ platformName, description, logoUrl, supportEmail }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Fall back to the branded mark if the configured logo URL fails to load
  // (e.g. a stale/dead storage URL) so we never show a broken-image icon.
  const [logoFailed, setLogoFailed] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  // Map auth redirect error codes to user-facing messages.
  const errorMessages: Record<string, string> = {
    deactivated: "Your account has been deactivated. Contact your administrator.",
    no_profile: "Your account isn't fully set up yet. Contact your administrator.",
    auth_callback_failed: "That sign-in link is invalid or has expired. Please try again.",
  };
  const urlError = errorCode ? errorMessages[errorCode] ?? null : null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) { setResetError("Email is required."); return; }

    setResetLoading(true);
    setResetError(null);

    const supabase = createClient();
    const siteUrl = window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${siteUrl}/auth/callback?type=recovery`,
    });

    if (error) {
      setResetError(error.message);
      setResetLoading(false);
      return;
    }

    setResetSent(true);
    setResetLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-3 mb-3">
            {logoUrl && !logoFailed ? (
              <Image
                src={logoUrl}
                alt={platformName}
                width={128}
                height={128}
                className="w-32 h-32 rounded-2xl object-contain"
                loading="eager"
                priority
                unoptimized
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="w-28 h-28 rounded-2xl bg-[#1E3A5F] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 12h6M9 16h4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8l-5-4H7z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 4v4h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
            <span className="text-2xl font-bold text-[#1A1A2E] tracking-tight">{platformName}</span>
          </div>
          {description && <p className="text-[#6B7280] text-sm">{description}</p>}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8">

          {mode === "login" ? (
            <>
              <h2 className="text-lg font-semibold text-[#1A1A2E] mb-6">Sign in to your account</h2>

              {urlError && (
                <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
                  {urlError}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-[#4A6FA5] text-[#1A1A2E] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-[#1A1A2E]">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setResetEmail(email); setResetSent(false); setResetError(null); }}
                      className="text-xs text-[#4A6FA5] hover:text-[#1E3A5F] font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-[#4A6FA5] text-[#1A1A2E] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition"
                  />
                </div>

                {error && (
                  <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#1E3A5F] hover:bg-[#162d4a] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </>
          ) : resetSent ? (
            <>
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-[#1A1A2E] mb-2">Check your email</h2>
                <p className="text-sm text-[#6B7280] mb-1">
                  We sent a password reset link to
                </p>
                <p className="text-sm font-medium text-[#1A1A2E] mb-6">{resetEmail}</p>
                <p className="text-xs text-[#9CA3AF] mb-6">
                  Click the link in the email to set a new password. The link expires in 1 hour.
                </p>
                <button
                  onClick={() => { setMode("login"); setResetSent(false); }}
                  className="text-sm text-[#4A6FA5] hover:text-[#1E3A5F] font-medium"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setMode("login")}
                className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#1A1A2E] mb-5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to sign in
              </button>

              <h2 className="text-lg font-semibold text-[#1A1A2E] mb-1">Reset your password</h2>
              <p className="text-sm text-[#6B7280] mb-6">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-[#4A6FA5] text-[#1A1A2E] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition"
                  />
                </div>

                {resetError && (
                  <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {resetError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-2.5 px-4 bg-[#1E3A5F] hover:bg-[#162d4a] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
                >
                  {resetLoading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        {supportEmail && (
          <p className="text-center text-xs text-[#6B7280] mt-6">
            Need help? Contact <a href={`mailto:${supportEmail}`} className="text-[#4A6FA5] hover:underline">{supportEmail}</a>
          </p>
        )}
        {!supportEmail && (
          <p className="text-center text-xs text-[#6B7280] mt-6">
            Contact your administrator if you need access.
          </p>
        )}
      </div>
    </div>
  );
}
