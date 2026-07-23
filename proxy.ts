import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Always use getUser() — validates token server-side, prevents stale-cookie redirect loops
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith("/login");

  // Server Actions invoked from the login page itself (e.g.
  // checkActiveSession()/heartbeatSession(), called right after a successful
  // sign-in but before router.refresh() navigates away) POST back to this
  // same /login pathname. They must pass through untouched — redirecting
  // them here breaks Next's Server Action response format ("An unexpected
  // response was received from the server") since the action's own request
  // target is this same URL. Next.js always marks these with a
  // `next-action` header.
  const isServerAction = request.headers.has("next-action");

  // Not logged in → redirect to login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in + on login page → route to correct home by role
  if (user && isLoginPage && !isServerAction) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("role, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();

    // Transient read failure (e.g. RLS hiccup / DB blip): do NOT destroy the
    // session or mislabel the user as deactivated — let them retry the page.
    if (error) {
      return supabaseResponse;
    }

    // Genuinely blocked: explicitly deactivated, soft-deleted, or no profile row.
    // Sign out with an accurate reason so active users are never trapped here.
    if (!profile || profile.is_active === false || profile.deleted_at !== null) {
      await supabase.auth.signOut();
      const reason = profile ? "deactivated" : "no_profile";
      return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
    }

    const url = request.nextUrl.clone();
    url.pathname =
      profile.role === "super_admin" || profile.role === "platform_admin"
        ? "/platform/dashboard"
        : profile.role === "guest_manager" || profile.role === "guest_user"
          ? "/proceedings"
          : "/dashboard";
    return NextResponse.redirect(url);
  }

  // Logged in — guard platform routes from non-platform users
  if (user && pathname.startsWith("/platform")) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    // On a transient read failure, let the request through — the platform
    // layout re-checks via getCurrentUser() and will redirect if truly needed.
    // This avoids falsely bouncing a real platform admin on a DB blip.
    if (!error) {
      const role = profile?.role;
      if (role !== "super_admin" && role !== "platform_admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
