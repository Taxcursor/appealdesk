import { SupabaseClient } from "@supabase/supabase-js";
import { SessionUser } from "@/lib/types";

// guest_manager/guest_user access is scoped to specific proceedings via
// proceedings.guest_ids (separate from assigned_to_ids, which is for
// sp_admin/sp_staff/director staff assignment) — not a role string alone.
// These checks must run against the service-role client (Server Actions
// bypass RLS by design, same as every other mutation in this codebase).

const STAFF_ROLES = ["sp_admin", "sp_staff", "director"];

/**
 * Single entry point for every proceeding/event/document mutation in the
 * Litigations module. sp_admin/sp_staff/director always pass. guest_manager
 * passes only if personally listed in the target proceeding's guest_ids.
 * Every other role (guest_user — always view-only — and client, which has
 * no write path here at all) throws. Deliberately does NOT no-op for
 * unrecognized roles, so a role added later without updating this list
 * fails closed rather than silently passing through.
 */
export async function assertCanWriteProceeding(
  supabase: SupabaseClient,
  user: SessionUser,
  proceedingId: string
): Promise<void> {
  if (STAFF_ROLES.includes(user.role)) return;
  if (user.role !== "guest_manager") throw new Error("Unauthorized");

  const { data } = await supabase
    .from("proceedings")
    .select("guest_ids")
    .eq("id", proceedingId)
    .maybeSingle();

  const guestIds = (data?.guest_ids as string[] | null) ?? [];
  if (!guestIds.includes(user.id)) {
    throw new Error("Unauthorized");
  }
}

/** Resolves the owning proceeding_id for an event — used by event/event-document actions. */
export async function proceedingIdForEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("events")
    .select("proceeding_id")
    .eq("id", eventId)
    .maybeSingle();
  return data?.proceeding_id ?? null;
}

/** Resolves the owning proceeding_id for a proceeding-level document. */
export async function proceedingIdForProceedingDoc(
  supabase: SupabaseClient,
  docId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("proceeding_documents")
    .select("proceeding_id")
    .eq("id", docId)
    .maybeSingle();
  return data?.proceeding_id ?? null;
}

/** Resolves the owning proceeding_id for an event-level document (via its event). */
export async function proceedingIdForEventDoc(
  supabase: SupabaseClient,
  docId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("event_documents")
    .select("event_id")
    .eq("id", docId)
    .maybeSingle();
  if (!data?.event_id) return null;
  return proceedingIdForEvent(supabase, data.event_id);
}
