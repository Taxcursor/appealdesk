import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SessionUser } from "@/lib/types";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select(`
      id, first_name, last_name, role, org_id, is_active, avatar_url,
      organization:organizations!org_id(id, type, parent_sp_id)
    `)
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  const org = profile.organization as unknown as { id: string; type: string; parent_sp_id: string | null } | null;

  // Derive service_provider_id based on role
  let service_provider_id: string | null = null;
  if (
    profile.role === "sp_admin" ||
    profile.role === "sp_staff" ||
    profile.role === "director" ||
    profile.role === "guest_manager" ||
    profile.role === "guest_user"
  ) {
    service_provider_id = profile.org_id;
  } else if (profile.role === "client") {
    service_provider_id = org?.parent_sp_id ?? null;
  }

  return {
    id: profile.id,
    email: user.email ?? "",
    role: profile.role,
    org_id: profile.org_id,
    org_type: (org?.type ?? "client") as SessionUser["org_type"],
    service_provider_id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    is_active: profile.is_active,
    avatar_url: (profile as unknown as { avatar_url?: string | null }).avatar_url ?? null,
    must_change_password: user.user_metadata?.must_change_password === true,
  };
  } catch {
    return null;
  }
});
