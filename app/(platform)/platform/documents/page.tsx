import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import PlatformDocumentsClient from "@/components/platform/PlatformDocumentsClient";

export default async function PlatformDocumentsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: forms }, { data: templates }] = await Promise.all([
    supabase
      .from("forms")
      .select("*, form_files(id)")
      .is("service_provider_id", null)
      .order("sort_order", { ascending: true }),

    supabase
      .from("templates")
      .select("*")
      .is("service_provider_id", null)
      .order("created_at", { ascending: true }),
  ]);

  const canEdit = user?.role === "super_admin" || user?.role === "platform_admin";

  return (
    <div className="p-8">
      <PlatformDocumentsClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        forms={(forms ?? []) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        templates={(templates ?? []) as any}
        canEdit={canEdit}
      />
    </div>
  );
}
