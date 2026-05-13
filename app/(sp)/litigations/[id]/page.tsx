import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import AppealDetailClient from "@/components/sp/AppealDetailClient";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function AppealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const spId = user?.service_provider_id ?? user?.org_id;

  const { data: appeal } = await supabase
    .from("appeals")
    .select(`
      id, status, client_org_id, created_at,
      act_regulation:master_records!act_regulation_id(id, name),
      financial_year:master_records!financial_year_id(id, name),
      assessment_year:master_records!assessment_year_id(id, name),
      client_org:organizations!client_org_id(id, name),
      proceedings(
        id, authority_type, authority_name, deleted_at,
        proceeding_type:master_records!proceeding_type_id(id, name),
        jurisdiction, jurisdiction_city, importance, mode, status,
        initiated_on, to_be_completed_by, assigned_to_ids, client_staff_ids,
        possible_outcome, is_active, created_at,
        events(
          id, event_type, category, parent_event_id, event_date, status, event_notice_number, description, details, created_at, deleted_at,
          event_documents(id, file_name, file_url, file_size, description, created_at, deleted_at)
        ),
        proceeding_documents(id, file_name, file_url, file_size, description, created_at, deleted_at)
      )
    `)
    .eq("id", id)
    .single();

  if (!appeal) notFound();

  const clientOrgId = (appeal as any).client_org_id as string;

  const [{ data: clients }, { data: teamMembers }, { data: clientUsers }, { data: masters }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("parent_sp_id", spId!)
      .eq("type", "client")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("users")
      .select("id, first_name, last_name")
      .eq("org_id", spId!)
      .eq("is_active", true)
      .in("role", ["sp_admin", "sp_staff"]),
    supabase
      .from("users")
      .select("id, first_name, last_name")
      .eq("org_id", clientOrgId)
      .eq("role", "client")
      .eq("is_active", true),
    supabase
      .from("master_records")
      .select("id, name, type, parent_id")
      .eq("level", "platform")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const mastersByType = (masters ?? []).reduce((acc, rec) => {
    if (!acc[rec.type]) acc[rec.type] = [];
    acc[rec.type].push({ id: rec.id, name: rec.name, type: rec.type, parent_id: rec.parent_id ?? null });
    return acc;
  }, {} as Record<string, { id: string; name: string; type: string; parent_id: string | null }[]>);

  const clientOrg = (appeal.client_org as any) ?? null;

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/litigations" className="text-sm text-[#6B7280] hover:text-[#1A1A2E] flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Litigations
        </Link>
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">
          {clientOrg?.name ?? "Litigation"}
          {(appeal as any).assessment_year?.name ? ` — AY ${(appeal as any).assessment_year.name}` : ""}
        </h1>
        {(appeal as any).act_regulation?.name && (
          <p className="text-[#6B7280] text-sm mt-0.5">{(appeal as any).act_regulation.name}</p>
        )}
      </div>
      <AppealDetailClient
        appeal={appeal as any}
        clients={clients ?? []}
        teamMembers={teamMembers ?? []}
        clientUsers={clientUsers ?? []}
        mastersByType={mastersByType}
        canEdit={user?.role === "sp_admin" || user?.role === "sp_staff"}
      />
    </div>
  );
}
