import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { redirect } from "next/navigation";
import PlatformRecycleBinClient from "@/components/platform/PlatformRecycleBinClient";

type UserOrg = { name: string };

type RawUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  deleted_at: string;
  organization: UserOrg | UserOrg[] | null;
};

type NormalizedUser = Omit<
  RawUser,
  "organization" | "first_name" | "last_name"
> & {
  organization: UserOrg | null;
  first_name: string;
  last_name: string;
};

type MasterRecord = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  deleted_at: string;
};

type OrgRecord = {
  id: string;
  name: string;
  business_type?: string | null;
  city?: string | null;
  deleted_at: string;
};

type NormalizedOrgRecord = Omit<OrgRecord, "business_type" | "city"> & {
  business_type?: string;
  city?: string;
};

export default async function PlatformRecycleBinPage() {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "platform_admin"].includes(user.role))
    redirect("/platform/dashboard");

  const supabase = await createClient();
  // eslint-disable-next-line react-hooks/purity
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [usersResult, mastersResult, providersResult, clientsResult] =
    await Promise.all([
      // Platform users: super_admin, platform_admin, sp_admin — deleted within 30 days
      supabase
        .from("users")
        .select(
          `
        id, first_name, last_name, email, role, deleted_at,
        organization:organizations!org_id(name)
      `,
        )
        .in("role", ["super_admin", "platform_admin", "sp_admin"])
        .not("deleted_at", "is", null)
        .gte("deleted_at", cutoff)
        .order("deleted_at", { ascending: false }),

      // Deleted master records (top-level only — children are cascade-deleted)
      supabase
        .from("master_records")
        .select("id, name, type, parent_id, deleted_at")
        .eq("level", "platform")
        .is("parent_id", null)
        .not("deleted_at", "is", null)
        .gte("deleted_at", cutoff)
        .order("deleted_at", { ascending: false }),

      // Deleted service providers
      supabase
        .from("organizations")
        .select("id, name, business_type, city, deleted_at")
        .eq("type", "service_provider")
        .not("deleted_at", "is", null)
        .gte("deleted_at", cutoff)
        .order("deleted_at", { ascending: false }),

      // Deleted clients
      supabase
        .from("organizations")
        .select("id, name, business_type, city, deleted_at")
        .eq("type", "client")
        .not("deleted_at", "is", null)
        .gte("deleted_at", cutoff)
        .order("deleted_at", { ascending: false }),
    ]);

  const users = usersResult.data as RawUser[] | null;
  const masters = mastersResult.data as MasterRecord[] | null;
  const providers = providersResult.data as OrgRecord[] | null;
  const clients = clientsResult.data as OrgRecord[] | null;

  const normalizedUsers: NormalizedUser[] = (users ?? []).map((u) => ({
    ...u,
    first_name: u.first_name ?? "",
    last_name: u.last_name ?? "",
    organization: Array.isArray(u.organization)
      ? (u.organization[0] ?? null)
      : u.organization,
  }));

  const normalizedProviders: NormalizedOrgRecord[] = (providers ?? []).map(
    (p) => ({
      ...p,
      business_type: p.business_type ?? undefined,
      city: p.city ?? undefined,
    }),
  );

  const normalizedClients: NormalizedOrgRecord[] = (clients ?? []).map((c) => ({
    ...c,
    business_type: c.business_type ?? undefined,
    city: c.city ?? undefined,
  }));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">Recycle Bin</h1>
        <p className="text-[#6B7280] text-sm mt-0.5">
          Deleted platform items are kept for 30 days, then permanently removed.
        </p>
      </div>
      <PlatformRecycleBinClient
        users={normalizedUsers}
        masters={masters ?? []}
        providers={normalizedProviders}
        clients={normalizedClients}
      />
    </div>
  );
}
