import { SupabaseClient } from "@supabase/supabase-js";

export async function logAction(
  supabase: SupabaseClient,
  params: {
    actorId: string;
    // null for platform-scoped actions (e.g. platform master records) that
    // aren't tied to any single service provider.
    spId: string | null;
    action: "create" | "update" | "delete";
    entityType: "appeal" | "proceeding" | "event" | "document" | "user" | "organization" | "master_record";
    entityLabel?: string;
  }
) {
  // Fire and forget — don't block the main action on log failures
  await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    service_provider_id: params.spId,
    action: params.action,
    entity_type: params.entityType,
    entity_label: params.entityLabel ?? null,
  }).then(() => {});
}
