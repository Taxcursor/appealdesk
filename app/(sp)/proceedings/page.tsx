/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { redirect } from "next/navigation";
import ProceedingsSummaryClient from "@/components/sp/ProceedingsSummaryClient";
import GuestProceedingsClient from "@/components/sp/GuestProceedingsClient";
import { getActCategory } from "@/lib/actCategory";
import { getBulkDemandTotals } from "@/app/(sp)/litigations/demand-actions";

function parseMulti(val: string | string[] | undefined): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val[0] : val;
  return raw.split(",").filter(Boolean);
}

export default async function ProceedingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;

  // Level 1 is a cross-client rollup — meaningless for a single-client user,
  // so send them straight to their own Level 2 page.
  if (user?.role === "client") {
    redirect(`/proceedings/${user.org_id}`);
  }

  // Guest roles never see the cross-client rollup — only the specific
  // proceeding(s) they're personally granted guest access to, via
  // guest_ids (separate from assigned_to_ids, which is staff assignment).
  if (user?.role === "guest_manager" || user?.role === "guest_user") {
    const { data: myProceedings } = await supabase
      .from("proceedings")
      .select(`
        id, status, authority_type, authority_name, jurisdiction, jurisdiction_city,
        importance, mode, initiated_on, to_be_completed_by, possible_outcome,
        proceeding_type:master_records!proceeding_type_id(id, name),
        appeal:appeals!appeal_id(
          id, status,
          client_org:organizations!client_org_id(id, name),
          act_regulation:master_records!act_regulation_id(id, name),
          financial_year:master_records!financial_year_id(id, name),
          assessment_year:master_records!assessment_year_id(id, name),
          litigation_type:master_records!litigation_type_id(id, name)
        )
      `)
      .contains("guest_ids", [user.id])
      .is("deleted_at", null)
      .order("to_be_completed_by", { ascending: true, nullsFirst: false });

    return (
      <div className="p-8">
        <GuestProceedingsClient
          proceedings={(myProceedings ?? []) as any}
          canEdit={user.role === "guest_manager"}
        />
      </div>
    );
  }

  // Status default differs from Litigations: absent = "open only" (not "all").
  // status=all is the explicit sentinel for "no filter".
  const rawStatus = params.status as string | undefined;
  const filterStatuses =
    rawStatus === undefined ? ["open"] : rawStatus === "all" ? [] : parseMulti(rawStatus);
  const filterClients = parseMulti(params.client);
  const filterActs = parseMulti(params.act);

  let appealsQuery = supabase
    .from("appeals")
    .select(`
      id, client_org_id,
      client_org:organizations!client_org_id(id, name),
      act_regulation:master_records!act_regulation_id(id, name),
      proceedings!inner(id, status, deleted_at)
    `)
    .eq("service_provider_id", spId!)
    .is("deleted_at", null)
    .is("proceedings.deleted_at", null);

  if (filterClients.length) appealsQuery = appealsQuery.in("client_org_id", filterClients);
  if (filterActs.length) appealsQuery = appealsQuery.in("act_regulation_id", filterActs);
  if (filterStatuses.length) appealsQuery = appealsQuery.in("proceedings.status", filterStatuses);

  const [
    { data: appeals },
    { data: clientRows },
    { data: actRows },
  ] = await Promise.all([
    appealsQuery,
    supabase
      .from("organizations")
      .select("id, name")
      .eq("parent_sp_id", spId!)
      .eq("type", "client")
      .eq("is_active", true)
      .order("name"),
    // All platform-level acts, not just ones already used in an appeal —
    // so the filter always reflects the full masters list (e.g. a newly
    // added act shows up here immediately, even with zero cases yet).
    supabase
      .from("master_records")
      .select("id, name")
      .eq("type", "act_regulation")
      .eq("level", "platform")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const proceedingIds = (appeals ?? []).flatMap((a: any) =>
    (a.proceedings ?? []).map((p: any) => p.id as string)
  );
  const demandByProceeding = await getBulkDemandTotals(proceedingIds);

  type CategoryAgg = { vol: number; proposed: number; accepted: number; dropped: number; disputed: number };
  const blankCategoryAgg = (): CategoryAgg => ({ vol: 0, proposed: 0, accepted: 0, dropped: 0, disputed: 0 });
  const summaryByCategory: Record<"IT" | "GST" | "Other" | "Total", CategoryAgg> = {
    IT: blankCategoryAgg(),
    GST: blankCategoryAgg(),
    Other: blankCategoryAgg(),
    Total: blankCategoryAgg(),
  };

  interface ClientAgg {
    clientId: string;
    clientName: string;
    it: number;
    gst: number;
    other: number;
    proposed: number;
    dropped: number;
    accepted: number;
    disputed: number;
  }
  const byClient = new Map<string, ClientAgg>();

  for (const appeal of (appeals ?? []) as any[]) {
    const category = getActCategory(appeal.act_regulation?.name);
    const clientId = appeal.client_org_id as string;
    const clientName = appeal.client_org?.name ?? "—";

    for (const proc of appeal.proceedings ?? []) {
      const demand = demandByProceeding[proc.id] ?? { proposed: 0, accepted: 0, dropped: 0, disputed: 0 };

      const cat = summaryByCategory[category];
      cat.vol += 1;
      cat.proposed += demand.proposed;
      cat.accepted += demand.accepted;
      cat.dropped += demand.dropped;
      cat.disputed += demand.disputed;
      summaryByCategory.Total.vol += 1;
      summaryByCategory.Total.proposed += demand.proposed;
      summaryByCategory.Total.accepted += demand.accepted;
      summaryByCategory.Total.dropped += demand.dropped;
      summaryByCategory.Total.disputed += demand.disputed;

      const client = byClient.get(clientId) ?? {
        clientId,
        clientName,
        it: 0,
        gst: 0,
        other: 0,
        proposed: 0,
        dropped: 0,
        accepted: 0,
        disputed: 0,
      };
      if (category === "IT") client.it += 1;
      else if (category === "GST") client.gst += 1;
      else client.other += 1;
      client.proposed += demand.proposed;
      client.dropped += demand.dropped;
      client.accepted += demand.accepted;
      client.disputed += demand.disputed;
      byClient.set(clientId, client);
    }
  }

  const clientTableRows = [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));

  return (
    <div className="p-8">
      <ProceedingsSummaryClient
        totalClients={clientTableRows.length}
        summaryByCategory={summaryByCategory}
        clientRows={clientTableRows}
        clients={clientRows ?? []}
        acts={actRows ?? []}
        currentClients={filterClients}
        currentActs={filterActs}
        currentStatuses={filterStatuses}
        canEdit={user?.role === "sp_admin" || user?.role === "sp_staff" || user?.role === "director"}
      />
    </div>
  );
}
