import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import UsersClient from "@/components/sp/UsersClient";

function parseMulti(val: string | string[] | undefined): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val[0] : val;
  return raw.split(",").filter(Boolean);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;

  const currentTab         = (params.tab as string) === "clients" ? "clients" : "team";
  const currentRoles       = parseMulti(params.role);
  const currentOrgs        = parseMulti(params.org);
  const currentDesignations = parseMulti(params.designation);
  const currentStatuses    = parseMulti(params.status);
  const currentSortDir     = (params.sort_dir as string) === "desc" ? "desc" : "asc";

  const isAdmin = user?.role === "sp_admin";

  // Fetch client org IDs under this SP
  const { data: clientOrgIds } = await supabase
    .from("organizations")
    .select("id")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .eq("is_active", true);

  const orgIdsToFetch = [spId!, ...(clientOrgIds ?? []).map((o) => o.id)];

  const { data: clientOrgsForImport } = isAdmin
    ? await supabase
        .from("organizations")
        .select("id, name")
        .eq("parent_sp_id", spId!)
        .eq("type", "client")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name")
    : { data: [] };

  const { data: users } = await supabase
    .from("users")
    .select(`
      id, first_name, middle_name, last_name, email,
      role, designation, department, is_active, created_at, org_id,
      organization:organizations!org_id(id, name, type)
    `)
    .in("org_id", orgIdsToFetch)
    .is("deleted_at", null)
    .order("first_name");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizedUsers = (users ?? []).map((u: any) => ({
    ...u,
    organization: Array.isArray(u.organization) ? (u.organization[0] ?? null) : u.organization,
  }));

  return (
    <div className="p-8">
      <UsersClient
        users={normalizedUsers}
        currentUserId={user!.id}
        isAdmin={isAdmin}
        clientOrgs={clientOrgsForImport ?? []}
        currentTab={currentTab as "team" | "clients"}
        currentRoles={currentRoles}
        currentOrgs={currentOrgs}
        currentDesignations={currentDesignations}
        currentStatuses={currentStatuses}
        currentSortDir={currentSortDir}
      />
    </div>
  );
}
