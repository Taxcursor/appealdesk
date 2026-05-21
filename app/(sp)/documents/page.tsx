import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import DocumentsClient from "@/components/sp/DocumentsClient";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;

  const [{ data: forms }, { data: templates }, { data: resources }, { data: acts }] = await Promise.all([
    supabase
      .from("forms")
      .select("*")
      .eq("service_provider_id", spId!)
      .order("sort_order", { ascending: true }),

    supabase
      .from("templates")
      .select("*")
      .eq("service_provider_id", spId!)
      .order("created_at", { ascending: true }),

    supabase
      .from("resources")
      .select("*, resource_files(*), act:master_records!act_id(id, name)")
      .eq("service_provider_id", spId!)
      .order("created_at", { ascending: true }),

    supabase
      .from("master_records")
      .select("id, name")
      .eq("type", "act_regulation")
      .eq("level", "platform")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const canEdit = user?.role === "sp_admin" || user?.role === "sp_staff";

  return (
    <div className="p-8">
      <DocumentsClient
        forms={(forms ?? []) as any}
        templates={(templates ?? []) as any}
        resources={(resources ?? []) as any}
        acts={(acts ?? []) as any}
        canEdit={canEdit}
      />
    </div>
  );
}
