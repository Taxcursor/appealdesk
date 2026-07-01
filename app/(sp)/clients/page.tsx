import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import ClientsClient from "@/components/sp/ClientsClient";

function parseMulti(val: string | string[] | undefined): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val[0] : val;
  return raw.split(",").filter(Boolean);
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;

  const currentClientIds = parseMulti(params.name);
  const currentBtypes    = parseMulti(params.btype);
  const currentCities    = parseMulti(params.city);
  const currentStatuses  = parseMulti(params.status);
  const currentSortDir   = (params.sort_dir as string) === "desc" ? "desc" : "asc";

  const { data: clients } = await supabase
    .from("organizations")
    .select("id, name, business_type, city, is_active, created_at")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .is("deleted_at", null)
    .order("name");

  return (
    <div
      className="p-8 min-h-screen"
      style={{ background: "linear-gradient(to right, #363636 0%, #ffffff 50%)" }}
    >
      <ClientsClient
        clients={clients ?? []}
        isAdmin={user?.role === "sp_admin"}
        currentClientIds={currentClientIds}
        currentBtypes={currentBtypes}
        currentCities={currentCities}
        currentStatuses={currentStatuses}
        currentSortDir={currentSortDir}
      />
    </div>
  );
}
