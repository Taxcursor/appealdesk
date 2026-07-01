/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import AppealsClient from "@/components/sp/AppealsClient";
import { PER_PAGE_OPTIONS, DEFAULT_PER_PAGE } from "@/lib/constants";

const APPEAL_SELECT = `
  id, status, created_at,
  act_regulation:master_records!act_regulation_id(id, name),
  financial_year:master_records!financial_year_id(id, name),
  assessment_year:master_records!assessment_year_id(id, name),
  client_org:organizations!client_org_id(id, name)
`;

function parseMulti(val: string | string[] | undefined): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val[0] : val;
  return raw.split(",").filter(Boolean);
}

function dedupeRecords(rows: any[] | null, key: string): { id: string; name: string }[] {
  const map = new Map<string, { id: string; name: string }>();
  (rows ?? []).forEach((r: any) => {
    const rec = r[key];
    if (rec?.id) map.set(rec.id, { id: rec.id, name: rec.name });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default async function AppealsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;
  const isClient = user?.role === "client";

  // Parse URL params — all multi-value (comma-separated)
  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const perPageRaw = parseInt((params.per_page as string) ?? "", 10);
  const perPage = PER_PAGE_OPTIONS.includes(perPageRaw) ? perPageRaw : DEFAULT_PER_PAGE;
  const filterClients   = parseMulti(params.client);
  const filterActs      = parseMulti(params.act);
  const filterFYs       = parseMulti(params.fy);
  const filterAYs       = parseMulti(params.ay);
  const filterStatuses  = parseMulti(params.status);
  const filterAssigned  = parseMulti(params.assigned);
  const sortAsc = (params.sort_dir as string) === "asc";

  const from = (page - 1) * perPage;
  const to   = from + perPage - 1;

  // Build main query
  let appealsQuery = supabase
    .from("appeals")
    .select(APPEAL_SELECT, { count: "exact" })
    .eq("service_provider_id", spId!)
    .is("deleted_at", null);

  if (isClient)              appealsQuery = appealsQuery.eq("client_org_id", user!.org_id!);
  if (filterClients.length)  appealsQuery = appealsQuery.in("client_org_id", filterClients);
  if (filterActs.length)     appealsQuery = appealsQuery.in("act_regulation_id", filterActs);
  if (filterFYs.length)      appealsQuery = appealsQuery.in("financial_year_id", filterFYs);
  if (filterAYs.length)      appealsQuery = appealsQuery.in("assessment_year_id", filterAYs);
  if (filterStatuses.length) appealsQuery = appealsQuery.in("status", filterStatuses);
  if (filterAssigned.length) appealsQuery = appealsQuery.in("assigned_to", filterAssigned);

  appealsQuery = appealsQuery.order("created_at", { ascending: sortAsc }).range(from, to);

  const [
    { data: appeals, count },
    { data: clients },
    { data: actRows },
    { data: fyRows },
    { data: ayRows },
    { data: userRows },
  ] = await Promise.all([
    appealsQuery,
    supabase.from("organizations").select("id, name").eq("parent_sp_id", spId!).eq("type", "client").eq("is_active", true).order("name"),
    supabase.from("appeals").select("act_regulation:master_records!act_regulation_id(id, name)").eq("service_provider_id", spId!).not("act_regulation_id", "is", null).is("deleted_at", null),
    supabase.from("appeals").select("financial_year:master_records!financial_year_id(id, name)").eq("service_provider_id", spId!).not("financial_year_id", "is", null).is("deleted_at", null),
    supabase.from("appeals").select("assessment_year:master_records!assessment_year_id(id, name)").eq("service_provider_id", spId!).not("assessment_year_id", "is", null).is("deleted_at", null),
    supabase.from("users").select("id, first_name, last_name").eq("org_id", spId!).in("role", ["sp_admin", "sp_staff"]).eq("is_active", true).is("deleted_at", null).order("first_name"),
  ]);

  const teamMembers = (userRows ?? []).map((u: any) => ({
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(" "),
  }));

  return (
    <div className="p-8">
      <AppealsClient
        appeals={(appeals ?? []) as any}
        clients={clients ?? []}
        acts={dedupeRecords(actRows, "act_regulation")}
        financialYears={dedupeRecords(fyRows, "financial_year")}
        assessmentYears={dedupeRecords(ayRows, "assessment_year")}
        teamMembers={teamMembers}
        canEdit={user?.role === "sp_admin" || user?.role === "sp_staff"}
        totalCount={count ?? 0}
        page={page}
        perPage={perPage}
        currentClients={filterClients}
        currentActs={filterActs}
        currentFYs={filterFYs}
        currentAYs={filterAYs}
        currentStatuses={filterStatuses}
        currentAssigned={filterAssigned}
        currentSortDir={sortAsc ? "asc" : "desc"}
      />
    </div>
  );
}
