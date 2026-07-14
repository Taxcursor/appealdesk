# Session Idle Timeout + Single Active Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-sign-out any user after 30 minutes of inactivity (with a 60s warning), and allow only one active login session per user — a new login asks to confirm before kicking an existing session out.

**Architecture:** One new nullable `users.active_session_last_seen_at` column acts as a heartbeat. A new client component `SessionGuard` (mounted once per portal layout, alongside `Sidebar`) tracks page activity for the idle timer and polls `supabase.auth.getUser()` every 60s both to detect a revoked session and to refresh the heartbeat. `LoginForm.tsx` checks that heartbeat right after a successful `signInWithPassword()` and, if fresh, shows a confirm/cancel dialog before either kicking the other session (`signOut({ scope: "others" })`) or backing out of the new one.

**Tech Stack:** Next.js 15/16 App Router, Supabase Auth (`@supabase/supabase-js` 2.103.0, `@supabase/ssr` 0.10.2), TypeScript, Tailwind v4.

**Note on verification:** This repo has no automated test runner (`package.json` only has `dev`/`build`/`start`/`lint`/`type-check` — no `test` script, no jest/vitest). Per this repo's established convention (see `CLAUDE.md` Debugging & Verification Rules), verification for each task is: `npm run type-check`, `npx eslint <changed files>`, a full `npm run build`, and a manual click-through — not automated tests. Steps below reflect that.

---

### Task 1: Migration — heartbeat column

**Files:**
- Create: `supabase/migrations/20260714_add_active_session_tracking.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Adds a per-user heartbeat timestamp used to detect whether the user
-- already has another active session at login time (single-active-session
-- feature). Idempotent — safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_session_last_seen_at timestamptz;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260714_add_active_session_tracking.sql
git commit -m "feat: add users.active_session_last_seen_at for session tracking"
```

- [ ] **Step 3: Tell the user to run it**

This repo has no CLI/programmatic SQL execution — the user runs migrations manually via the Supabase Dashboard SQL editor (established pattern from the most recent prior migration in this repo). After this task, tell the user: "Please run `supabase/migrations/20260714_add_active_session_tracking.sql` via the Supabase Dashboard SQL editor — same as last time." Do not proceed to assume the column exists until they confirm, but later tasks (2–6) are pure code changes that don't require the column to exist yet to write/build correctly — only Task 7's manual verification needs it applied.

---

### Task 2: Server actions for session bookkeeping

**Files:**
- Create: `lib/session-actions.ts`

- [ ] **Step 1: Write the file**

```typescript
"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";

// A heartbeat older than this is treated as a dead/abandoned session (e.g.
// the browser was closed without a clean logout) — a new login proceeds
// without prompting. Must be comfortably larger than SessionGuard's 60s
// heartbeat interval so a live session's heartbeat never appears stale.
const GRACE_MS = 90_000;

export async function checkActiveSession(): Promise<{ hasOtherSession: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("active_session_last_seen_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const lastSeen = data?.active_session_last_seen_at
    ? new Date(data.active_session_last_seen_at).getTime()
    : null;

  const hasOtherSession = lastSeen !== null && Date.now() - lastSeen < GRACE_MS;
  return { hasOtherSession };
}

export async function heartbeatSession(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("users")
    .update({ active_session_last_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
}

export async function clearActiveSession(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return; // already signed out — nothing to clear

  const supabase = await createServiceClient();
  await supabase
    .from("users")
    .update({ active_session_last_seen_at: null })
    .eq("id", user.id);
}
```

- [ ] **Step 2: Verify types/lint**

This repo has no generated Supabase schema types — `createClient()`/`createServiceClient()` are called with no generic type parameter anywhere (confirmed: no `database.types.ts` file, no `Database` generic in `lib/supabase/*.ts`), and `.from("users")` calls elsewhere in the codebase (e.g. `lib/user.ts`) are untyped/loosely-typed. So no schema-type file needs updating for the new `active_session_last_seen_at` column.

Run: `cd "/Users/nandakumar/Documents/01 Other Projects/suresh/appealdesk" && npx tsc --noEmit`
Expected: no new errors from `lib/session-actions.ts`.

Run: `npx eslint lib/session-actions.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/session-actions.ts
git commit -m "feat: add session bookkeeping server actions (checkActiveSession, heartbeatSession, clearActiveSession)"
```

---

### Task 3: `SessionGuard` client component

**Files:**
- Create: `components/layout/SessionGuard.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { heartbeatSession, clearActiveSession } from "@/lib/session-actions";

const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_LEAD_MS = 60 * 1000; // show the warning 60s before the limit
const IDLE_CHECK_INTERVAL_MS = 5_000;
const SESSION_POLL_INTERVAL_MS = 60_000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export default function SessionGuard() {
  const router = useRouter();
  // Seeded with 0 (a pure literal) rather than Date.now() — calling an impure
  // function directly in a useRef initializer during render trips this repo's
  // react-hooks/purity lint rule. The real timestamp is set in the effect
  // below via resetActivity(), which runs after mount, before the idle-check
  // interval's first tick.
  const lastActivityRef = useRef(0);
  const hasLoggedOutRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSecondsLeft(null);
  }, []);

  const forceLogout = useCallback(
    async (reason: "idle_timeout" | "session_replaced") => {
      if (hasLoggedOutRef.current) return;
      hasLoggedOutRef.current = true;

      try {
        await clearActiveSession();
      } catch {
        // best-effort — don't block logout on a bookkeeping failure
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push(`/login?error=${reason}`);
    },
    [router],
  );

  // Activity listeners reset the idle clock. Passive + cheap (ref write, no
  // re-render) so mousemove/scroll don't cause perf issues. Also seeds
  // lastActivityRef with a real timestamp on mount (see comment above).
  useEffect(() => {
    resetActivity();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetActivity, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetActivity));
    };
  }, [resetActivity]);

  // Idle-timeout ticker: shows the warning modal in the last 60s, force-logs-out at 30 min.
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = IDLE_LIMIT_MS - elapsed;

      if (remaining <= 0) {
        forceLogout("idle_timeout");
        return;
      }
      setSecondsLeft(remaining <= WARNING_LEAD_MS ? Math.ceil(remaining / 1000) : null);
    }, IDLE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [forceLogout]);

  // Session-validity + heartbeat ticker: catches a session revoked elsewhere
  // (single-active-login), and otherwise refreshes the heartbeat so future
  // logins can detect this session as still alive.
  useEffect(() => {
    let cancelled = false;

    async function check() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        forceLogout("session_replaced");
        return;
      }
      try {
        await heartbeatSession();
      } catch {
        // transient failure — don't force logout on a single missed heartbeat
      }
    }

    check(); // immediate check on mount, avoids a 60s bootstrap gap
    const id = setInterval(check, SESSION_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [forceLogout]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-heading mb-2">Session Expiring</h3>
        <p className="text-sm text-secondary mb-5">
          You&apos;ll be signed out in {secondsLeft}s due to inactivity.
        </p>
        <button
          type="button"
          onClick={resetActivity}
          className="w-full px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition"
        >
          Stay Signed In
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types/lint**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx eslint components/layout/SessionGuard.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/layout/SessionGuard.tsx
git commit -m "feat: add SessionGuard component (idle timeout + revoked-session detection)"
```

---

### Task 4: Mount `SessionGuard` in both portal layouts

**Files:**
- Modify: `app/(sp)/layout.tsx`
- Modify: `app/(platform)/layout.tsx`

- [ ] **Step 1: Update `app/(sp)/layout.tsx`**

Add the import and mount `<SessionGuard />` as a sibling of `<Sidebar />`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";
import SessionGuard from "@/components/layout/SessionGuard";

export default async function SpLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Platform admins should not access SP workspace
  if (user.role === "super_admin" || user.role === "platform_admin") {
    redirect("/platform/dashboard");
  }

  if (user.must_change_password) redirect("/auth/change-password");

  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", spId!)
    .single();

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <SessionGuard />
      <Sidebar
        userName={`${user.first_name} ${user.last_name}`}
        userRole={user.role}
        orgName={org?.name}
        orgLogoUrl={org?.logo_url ?? undefined}
        userAvatarUrl={user.avatar_url ?? undefined}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(platform)/layout.tsx`** the same way

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";
import SessionGuard from "@/components/layout/SessionGuard";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin" && user.role !== "platform_admin") redirect("/dashboard");

  if (user.must_change_password) redirect("/auth/change-password");

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("platform_name, logo_url")
    .single();

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <SessionGuard />
      <Sidebar
        userName={`${user.first_name} ${user.last_name}`}
        userRole={user.role}
        isPlatform
        orgName={settings?.platform_name}
        orgLogoUrl={settings?.logo_url ?? undefined}
        userAvatarUrl={user.avatar_url ?? undefined}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
```

`SessionGuard` renders `null` except when showing the warning modal, so its placement in the DOM (before `Sidebar`) doesn't affect layout.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint "app/(sp)/layout.tsx" "app/(platform)/layout.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(sp)/layout.tsx" "app/(platform)/layout.tsx"
git commit -m "feat: mount SessionGuard in both portal layouts"
```

---

### Task 5: Clear the heartbeat on explicit logout

**Files:**
- Modify: `components/layout/Sidebar.tsx:221-225`

- [ ] **Step 1: Update `handleLogout`**

Current code (lines 221–225):

```tsx
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }
```

Replace with:

```tsx
  async function handleLogout() {
    try {
      await clearActiveSession();
    } catch {
      // best-effort — don't block logout on a bookkeeping failure
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }
```

Order matters: `clearActiveSession()` must run *before* `signOut()`, because it's a Server Action gated on `getCurrentUser()` — once `signOut()` clears the auth cookies, the server can no longer identify the caller and the clear would silently no-op.

- [ ] **Step 2: Add the import**

Near the top of `components/layout/Sidebar.tsx`, alongside the existing `createClient` import:

```tsx
import { createClient } from "@/lib/supabase/client";
import { clearActiveSession } from "@/lib/session-actions";
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint components/layout/Sidebar.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: clear session heartbeat on explicit logout"
```

---

### Task 6: Login-time session-conflict check + confirm dialog

**Files:**
- Modify: `app/login/LoginForm.tsx`

- [ ] **Step 1: Add the import**

At the top, alongside the existing `createClient` import:

```tsx
import { createClient } from "@/lib/supabase/client";
import { checkActiveSession, heartbeatSession } from "@/lib/session-actions";
```

- [ ] **Step 2: Add new state**

Alongside the existing `useState` declarations (after `logoFailed`):

```tsx
  const [sessionConflict, setSessionConflict] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);
```

- [ ] **Step 3: Extend the `errorMessages` map**

Current (lines 32–36):

```tsx
  const errorMessages: Record<string, string> = {
    deactivated: "Your account has been deactivated. Contact your administrator.",
    no_profile: "Your account isn't fully set up yet. Contact your administrator.",
    auth_callback_failed: "That sign-in link is invalid or has expired. Please try again.",
  };
```

Replace with:

```tsx
  const errorMessages: Record<string, string> = {
    deactivated: "Your account has been deactivated. Contact your administrator.",
    no_profile: "Your account isn't fully set up yet. Contact your administrator.",
    auth_callback_failed: "That sign-in link is invalid or has expired. Please try again.",
    idle_timeout: "You were signed out due to 30 minutes of inactivity.",
    session_replaced: "Your account was signed in from another device.",
  };
```

- [ ] **Step 4: Rewrite `handleLogin` and add the conflict handlers**

Current (lines 39–54):

```tsx
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
```

Replace with:

```tsx
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

    // Fail open: a bookkeeping-check failure shouldn't block a valid login.
    let hasOtherSession = false;
    try {
      hasOtherSession = (await checkActiveSession()).hasOtherSession;
    } catch {
      hasOtherSession = false;
    }

    if (hasOtherSession) {
      setSessionConflict(true);
      setLoading(false);
      return;
    }

    try {
      await heartbeatSession();
    } catch {
      // best-effort — a missed heartbeat isn't worth blocking login over
    }
    router.refresh();
  }

  async function handleContinueSession() {
    setConflictLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "others" });
    try {
      await heartbeatSession();
    } catch {
      // best-effort
    }
    router.refresh();
  }

  async function handleCancelSession() {
    setConflictLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    setSessionConflict(false);
    setConflictLoading(false);
    setPassword("");
  }
```

- [ ] **Step 5: Render the confirm/cancel dialog**

Add this right before the closing `</div>` of the outer `<div className="w-full max-w-md">` wrapper (i.e. after the support-email paragraphs, still inside that wrapper, so it overlays correctly within the centered login card column — actually place it as a fixed-position overlay so it isn't clipped by the card's layout: insert immediately after the opening `<div className="min-h-screen ...">` wrapper's first child, as a sibling positioned via `fixed`). Concretely, add it right after the closing `</div>` of `<div className="w-full max-w-md">...</div>` and before the final closing `</div>` of the root `min-h-screen` wrapper:

```tsx
        {sessionConflict && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm">
              <h3 className="text-base font-semibold text-heading mb-2">
                Already Signed In Elsewhere
              </h3>
              <p className="text-sm text-secondary mb-5">
                Your account is currently signed in on another device or browser.
                Continue here and sign out the other session, or cancel?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelSession}
                  disabled={conflictLoading}
                  className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleContinueSession}
                  disabled={conflictLoading}
                  className="flex-1 px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
```

This follows the same overlay pattern used elsewhere in the app (e.g. `Sidebar.tsx`'s change-password modal, `AppealDetailClient.tsx`'s delete-confirm dialog).

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint app/login/LoginForm.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/login/LoginForm.tsx
git commit -m "feat: prompt before kicking an existing session on login"
```

---

### Task 7: Full build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `cd "/Users/nandakumar/Documents/01 Other Projects/suresh/appealdesk" && npm run build`
Expected: builds clean, no TypeScript errors, no new warnings beyond this repo's pre-existing ones.

- [ ] **Step 2: Confirm the migration has been applied**

Ask the user to confirm they've run `supabase/migrations/20260714_add_active_session_tracking.sql` via the Supabase Dashboard SQL editor (Task 1, Step 3) if they haven't already. Do not proceed to manual testing until confirmed, since `checkActiveSession`/`heartbeatSession`/`clearActiveSession` will error against a missing column.

- [ ] **Step 3: Manual test — single active session**

1. Log in as the same user in two different browsers (or one normal + one incognito window).
2. In browser A, log in normally — no dialog (nothing to conflict with yet).
3. In browser B, log in as the same user within 90 seconds of A's login (or of A's last heartbeat — A's `SessionGuard` heartbeats every 60s once mounted, so as long as A is on an authenticated page, B will always see a fresh heartbeat).
4. Confirm B shows the "Already Signed In Elsewhere" dialog.
5. Click **Cancel** in B — confirm B returns to the login form, and A is completely unaffected (refresh A's page, still logged in).
6. Log in again in B, click **Continue** this time — confirm B enters the app.
7. Within ~60 seconds, confirm A gets redirected to `/login?error=session_replaced` and shows the red banner "Your account was signed in from another device." (A's `SessionGuard` session-poll interval catches this on its next tick; you can force it sooner by refreshing/navigating in A.)

- [ ] **Step 4: Manual test — explicit logout frees the slot**

1. Log in as the user in browser A, then log out via the sidebar.
2. Immediately log in as the same user in browser B.
3. Confirm B does **not** show the conflict dialog (the heartbeat was cleared by A's logout).

- [ ] **Step 5: Manual test — idle timeout**

Testing the real 30-minute/60-second thresholds isn't practical to sit through by hand. Temporarily lower the constants in `components/layout/SessionGuard.tsx` for local testing only:

```tsx
const IDLE_LIMIT_MS = 20_000; // TEMP: 20s for manual testing — revert before committing
const WARNING_LEAD_MS = 10_000; // TEMP: 10s warning — revert before committing
```

1. `npm run dev`, log in, then stop moving the mouse/typing entirely.
2. Confirm the "Session Expiring" modal appears with a live countdown around the 10s-remaining mark.
3. Confirm moving the mouse or clicking "Stay Signed In" dismisses the modal and resets the clock.
4. Let it run out completely (no activity) — confirm it redirects to `/login?error=idle_timeout` and shows "You were signed out due to 30 minutes of inactivity."
5. **Revert the temporary constant changes** back to `30 * 60 * 1000` / `60 * 1000` before committing anything further. Run `git diff components/layout/SessionGuard.tsx` to confirm no stray changes remain from this step.

- [ ] **Step 6: Regression check — normal login unaffected**

Log in as a user with no conflicting session (e.g. after a clean logout, or a brand new test user). Confirm login proceeds exactly as before this feature — no dialog, no delay beyond one extra network round-trip.

---

## Post-implementation notes for the user

- This feature adds one DB column (`users.active_session_last_seen_at`) and touches no other tables — nothing to back up beyond the standard migration caution already established in this project.
- The 90-second grace window (`GRACE_MS` in `lib/session-actions.ts`) and the 30-minute/60-second idle thresholds (`IDLE_LIMIT_MS`/`WARNING_LEAD_MS` in `SessionGuard.tsx`) are the two tunable constants if these numbers need adjusting later.
