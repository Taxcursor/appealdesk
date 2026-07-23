/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { notFound } from "next/navigation";
import ProceedingClientDetailClient from "@/components/sp/ProceedingClientDetailClient";
import { getActCategory, type ActCategory } from "@/lib/actCategory";
import { getBulkDemandTotals } from "@/app/(sp)/litigations/demand-actions";
import { blankSummaryByCategory } from "@/components/sp/ProceedingsSummaryTable";

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

export default async function ProceedingClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;

  const { data: clientOrg } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", clientId)
    .eq("type", "client")
    .maybeSingle();

  if (!clientOrg) notFound();

  // Resolve ?category=IT|GST|Other into real act_regulation ids (category
  // isn't a stored column). An explicit act= param always wins.
  const { data: actMasters } = await supabase
    .from("master_records")
    .select("id, name")
    .eq("type", "act_regulation")
    .eq("level", "platform")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");

  const explicitActIds = parseMulti(sp.act);
  const categoryParam = (sp.category as string | undefined) as ActCategory | undefined;
  const effectiveActIds = explicitActIds.length
    ? explicitActIds
    : categoryParam
      ? (actMasters ?? []).filter((m) => getActCategory(m.name) === categoryParam).map((m) => m.id)
      : [];

  // Status default matches Level 1: absent = "open only"; status=all = explicit no-filter.
  const rawStatus = sp.status as string | undefined;
  const filterStatuses =
    rawStatus === undefined ? ["open"] : rawStatus === "all" ? [] : parseMulti(rawStatus);
  const filterFYs = parseMulti(sp.fy);

  // Fetch everything for this client filtered only by Act/category — this is
  // the set that drives the Proceedings Summary + Total Open Proceedings tile,
  // not the live FY/Status chips below them (same two-tier filtering as the
  // Active Cases table further down).
  let appealsQuery = supabase
    .from("appeals")
    .select(`
      id, status, created_at,
      act_regulation:master_records!act_regulation_id(id, name),
      financial_year:master_records!financial_year_id(id, name),
      litigation_type:master_records!litigation_type_id(id, name),
      proceedings(id, status, deleted_at, created_at, jurisdiction, jurisdiction_city,
                  to_be_completed_by, possible_outcome,
                  proceeding_type:master_records!proceeding_type_id(id, name))
    `)
    .eq("service_provider_id", spId!)
    .eq("client_org_id", clientId)
    .is("deleted_at", null);

  if (effectiveActIds.length) appealsQuery = appealsQuery.in("act_regulation_id", effectiveActIds);

  const [{ data: appeals }, { data: fyRows }] = await Promise.all([
    appealsQuery,
    supabase
      .from("appeals")
      .select("financial_year:master_records!financial_year_id(id, name)")
      .eq("service_provider_id", spId!)
      .eq("client_org_id", clientId)
      .not("financial_year_id", "is", null)
      .is("deleted_at", null),
  ]);

  // Flatten appeals -> proceedings (KPI-scoping set: Act/category filter only)
  const flatRows = (appeals ?? []).flatMap((appeal: any) =>
    (appeal.proceedings ?? [])
      .filter((p: any) => !p.deleted_at)
      .map((proc: any) => ({ appeal, proc }))
  );
  flatRows.sort(
    (a: any, b: any) => new Date(a.proc.created_at).getTime() - new Date(b.proc.created_at).getTime()
  );

  const demandByProceeding = await getBulkDemandTotals(flatRows.map((r: any) => r.proc.id as string));
  const zeroDemand = { proposed: 0, accepted: 0, dropped: 0, disputed: 0 };

  // Same Category/Vol./Proposed/Dropped/Accepted/Disputed summary as Level 1,
  // scoped to this client (over the Act/category-seeded flatRows set).
  const summaryByCategory = blankSummaryByCategory();
  let openProceedingsCount = 0;
  for (const r of flatRows as any[]) {
    if ((r.proc.status ?? "open") === "open") openProceedingsCount += 1;
    const category = getActCategory(r.appeal.act_regulation?.name);
    const d = demandByProceeding[r.proc.id] ?? zeroDemand;
    const cat = summaryByCategory[category];
    cat.vol += 1;
    cat.proposed += d.proposed;
    cat.accepted += d.accepted;
    cat.dropped += d.dropped;
    cat.disputed += d.disputed;
    summaryByCategory.Total.vol += 1;
    summaryByCategory.Total.proposed += d.proposed;
    summaryByCategory.Total.accepted += d.accepted;
    summaryByCategory.Total.dropped += d.dropped;
    summaryByCategory.Total.disputed += d.disputed;
  }

  // Active Cases table: same set, further filtered by FY/Status chips.
  const activeCaseRows = flatRows.filter((r: any) => {
    if (filterFYs.length && !filterFYs.includes(r.appeal.financial_year?.id)) return false;
    if (filterStatuses.length && !filterStatuses.includes(r.proc.status ?? "open")) return false;
    return true;
  });

  const activeCaseRowsWithDemand = activeCaseRows.map((r: any) => ({
    appeal: r.appeal,
    proc: r.proc,
    demand: demandByProceeding[r.proc.id] ?? zeroDemand,
  }));

  const portfolioTotals = activeCaseRowsWithDemand.reduce(
    (acc, r) => {
      acc.proposed += r.demand.proposed;
      acc.accepted += r.demand.accepted;
      acc.dropped += r.demand.dropped;
      acc.disputed += r.demand.disputed;
      return acc;
    },
    { proposed: 0, accepted: 0, dropped: 0, disputed: 0 }
  );

  return (
    <div className="p-8">
      <ProceedingClientDetailClient
        clientId={clientId}
        clientName={clientOrg.name}
        openProceedingsCount={openProceedingsCount}
        summaryByCategory={summaryByCategory}
        activeCaseRows={activeCaseRowsWithDemand}
        portfolioTotals={portfolioTotals}
        acts={actMasters ?? []}
        financialYears={dedupeRecords(fyRows, "financial_year")}
        currentActs={effectiveActIds}
        currentFYs={filterFYs}
        currentStatuses={filterStatuses}
        currentCategory={categoryParam}
        canEdit={user?.role === "sp_admin" || user?.role === "sp_staff" || user?.role === "director"}
      />
    </div>
  );
}
