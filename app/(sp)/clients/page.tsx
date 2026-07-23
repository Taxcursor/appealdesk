import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import ClientsClient from "@/components/sp/ClientsClient";

interface ComplianceDetail {
  type: string;
  number: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  business_type?: string;
  city?: string;
  is_active: boolean;
  created_at: string;
  date_of_incorporation?: string | null;
  file_number?: string | null;
  compliance_details?: ComplianceDetail[];
}

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

  const [{ data: clients }, { data: btRecords }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, business_type, city, is_active, created_at, date_of_incorporation, file_number, compliance_details(type, number)")
      .eq("parent_sp_id", spId!)
      .eq("type", "client")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("master_records")
      .select("name")
      .eq("type", "business_type")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  const businessTypes = (btRecords ?? []).map((r) => r.name);

  return (
    <div
      className="p-8 min-h-screen"
      style={{ background: "linear-gradient(to right, #363636 0%, #ffffff 50%)" }}
    >
      <ClientsClient
        clients={(clients ?? []) as unknown as ClientRow[]}
        isAdmin={user?.role === "sp_admin"}
        currentClientIds={currentClientIds}
        currentBtypes={currentBtypes}
        currentCities={currentCities}
        currentStatuses={currentStatuses}
        currentSortDir={currentSortDir}
        userId={user?.id ?? ""}
        businessTypes={businessTypes}
      />
    </div>
  );
}
