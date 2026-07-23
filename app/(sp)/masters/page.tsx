import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import SpMastersClient from "@/components/sp/SpMastersClient";

export default async function SpMastersPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Fetch only platform-level records — SP-level custom master records are
  // not a supported feature; all master data is platform-managed.
  const { data: records } = await supabase
    .from("master_records")
    .select("id, name, type, parent_id, is_active, sort_order")
    .eq("level", "platform")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-heading">Master Records</h1>
        <p className="text-secondary text-sm mt-0.5">
          Platform-managed values used across all litigations
        </p>
      </div>
      <SpMastersClient
        records={records ?? []}
        isAdmin={user?.role === "sp_admin" || user?.role === "director"}
      />
    </div>
  );
}
