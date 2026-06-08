import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import MastersClient from "@/components/platform/MastersClient";

export default async function MastersPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: records } = await supabase
    .from("master_records")
    .select("id, name, type, parent_id, is_active, sort_order")
    .eq("level", "platform")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">
          Master Records
        </h1>
        <p className="text-[#6B7280] text-sm mt-0.5">
          Global platform-level reference data used across all service providers
        </p>
      </div>
      <MastersClient records={records ?? []} userRole={user!.role} />
    </div>
  );
}
