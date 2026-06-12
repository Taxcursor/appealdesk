import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import ClientForm from "@/components/sp/ClientForm";
import GstFetchButton from "@/components/sp/GstFetchButton";
import { getCurrentUser } from "@/lib/user";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: org }, { data: compliance }, { data: btRecords }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", id).single(),
    supabase.from("compliance_details").select("*").eq("org_id", id),
    supabase.from("master_records").select("name").eq("type", "business_type").eq("is_active", true).order("sort_order").order("name"),
  ]);

  const businessTypes = (btRecords ?? []).map((r) => r.name);

  if (!org) notFound();

  const gstCompliance = (compliance ?? []).find((c) => c.type === "gst");
  const gstin = gstCompliance?.number ?? null;
  const canFetchGst = (user?.role === "sp_admin" || user?.role === "sp_staff") && !!gstin;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/clients" className="text-sm text-[#6B7280] hover:text-[#1A1A2E] flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Clients
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1A2E]">{org.name}</h1>
            <p className="text-[#6B7280] text-sm mt-0.5">
              {user?.role === "sp_admin" ? "Edit client details" : "Client details (read-only)"}
            </p>
          </div>
          {canFetchGst && <GstFetchButton gstin={gstin} />}
        </div>
      </div>
      <ClientForm
        mode="edit"
        clientId={id}
        initialData={org}
        initialCompliance={compliance ?? []}
        readOnly={user?.role !== "sp_admin"}
        businessTypes={businessTypes}
      />
    </div>
  );
}
