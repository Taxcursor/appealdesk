import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import AppealForm from "@/components/sp/AppealForm";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function NewAppealPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user || !["sp_admin", "sp_staff", "director"].includes(user.role)) redirect("/litigations");

  const params = await searchParams;
  const defaultClientId = typeof params.client === "string" ? params.client : undefined;

  const supabase = await createClient();
  const spId = user.service_provider_id ?? user.org_id;

  const [{ data: clients }, { data: teamMembers }, { data: guestUsers }, { data: masters }] = await Promise.all([
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
      .in("role", ["sp_admin", "sp_staff", "director"]),
    supabase
      .from("users")
      .select("id, first_name, last_name, role")
      .eq("org_id", spId!)
      .eq("is_active", true)
      .in("role", ["guest_manager", "guest_user"]),
    supabase
      .from("master_records")
      .select("id, name, type, parent_id")
      .eq("level", "platform")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const clientOrgIds = (clients ?? []).map((c) => c.id);
  const { data: allClientUsers } = clientOrgIds.length
    ? await supabase
        .from("users")
        .select("id, first_name, last_name, org_id")
        .in("org_id", clientOrgIds)
        .eq("role", "client")
        .eq("is_active", true)
    : { data: [] };

  const clientUsersByOrg = (allClientUsers ?? []).reduce((acc, u) => {
    if (!acc[u.org_id]) acc[u.org_id] = [];
    acc[u.org_id].push({ id: u.id, first_name: u.first_name, last_name: u.last_name });
    return acc;
  }, {} as Record<string, { id: string; first_name: string; last_name: string }[]>);

  const mastersByType = (masters ?? []).reduce((acc, rec) => {
    if (!acc[rec.type]) acc[rec.type] = [];
    acc[rec.type].push({ id: rec.id, name: rec.name, type: rec.type, parent_id: rec.parent_id ?? null });
    return acc;
  }, {} as Record<string, { id: string; name: string; type: string; parent_id: string | null }[]>);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/litigations" className="text-sm text-secondary hover:text-heading flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Litigations
        </Link>
        <h1 className="text-2xl font-semibold text-heading">Create New Litigation</h1>
        <p className="text-secondary text-sm mt-0.5">Fill in the litigation details and first proceeding below.</p>
      </div>
      <AppealForm
        clients={clients ?? []}
        teamMembers={teamMembers ?? []}
        mastersByType={mastersByType}
        clientUsersByOrg={clientUsersByOrg}
        guestUsers={guestUsers ?? []}
        defaultClientId={defaultClientId}
      />
    </div>
  );
}
