import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import LogsClient from "@/components/sp/LogsClient";
import { redirect } from "next/navigation";

const PER_PAGE = 50;

function parseMulti(val: string | string[] | undefined): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val[0] : val;
  return raw.split(",").filter(Boolean);
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user || !["sp_admin", "director"].includes(user.role)) redirect("/dashboard");

  const params = await searchParams;
  const supabase = await createClient();
  const spId = user.service_provider_id ?? user.org_id;

  const page            = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const filterClients   = parseMulti(params.client);   // org IDs
  const filterActions   = parseMulti(params.action);
  const filterEntities  = parseMulti(params.entity);
  const fromDate        = (params.from as string) ?? "";
  const toDate          = (params.to   as string) ?? "";

  const from = (page - 1) * PER_PAGE;
  const to   = from + PER_PAGE - 1;

  // Fetch client orgs for the filter dropdown
  const { data: clientOrgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .eq("is_active", true)
    .order("name");

  let q = supabase
    .from("audit_logs")
    .select(`id, action, entity_type, entity_label, created_at, actor:users!actor_id(first_name, last_name, role)`, { count: "exact" })
    .eq("service_provider_id", spId!)
    .order("created_at", { ascending: false });

  if (filterActions.length)  q = q.in("action", filterActions);
  if (filterEntities.length) q = q.in("entity_type", filterEntities);
  if (fromDate)              q = q.gte("created_at", fromDate);
  if (toDate)                q = q.lte("created_at", toDate + "T23:59:59");

  // Client filter: resolve selected org IDs → org names → ilike on entity_label
  if (filterClients.length) {
    const selectedOrgs = (clientOrgs ?? []).filter((o) => filterClients.includes(o.id));
    if (selectedOrgs.length) {
      const orCondition = selectedOrgs.map((o) => `entity_label.ilike.%${o.name}%`).join(",");
      q = q.or(orCondition);
    }
  }

  const { data: logs, count } = await q.range(from, to);

  return (
    <div className="p-8">
      <LogsClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logs={(logs ?? []) as any}
        clients={clientOrgs ?? []}
        totalCount={count ?? 0}
        page={page}
        perPage={PER_PAGE}
        currentClients={filterClients}
        currentActions={filterActions}
        currentEntities={filterEntities}
        currentFrom={fromDate}
        currentTo={toDate}
      />
    </div>
  );
}
