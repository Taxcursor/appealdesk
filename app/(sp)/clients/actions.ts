"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAction } from "@/lib/audit";

export interface ComplianceInput {
  type: string;
  number?: string;
  login_id?: string;
  credential?: string;
  attachment_url?: string;
}

export interface ClientInput {
  name: string;
  file_number?: string;
  business_type?: string;
  date_of_incorporation?: string;
  logo_url?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  compliance: ComplianceInput[];
}

export async function createClientOrg(input: ClientInput) {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name: input.name,
      type: "client",
      parent_sp_id: user.org_id,
      file_number: input.file_number || null,
      business_type: input.business_type || null,
      date_of_incorporation: input.date_of_incorporation || null,
      logo_url: input.logo_url || null,
      address_line1: input.address_line1 || null,
      address_line2: input.address_line2 || null,
      city: input.city || null,
      state: input.state || null,
      pin_code: input.pin_code || null,
      country: input.country || "India",
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      throw new Error(`A client named "${input.name}" already exists.`);
    throw new Error(error.message);
  }

  const complianceRows = input.compliance.filter(
    (c) => c.number || c.login_id || c.attachment_url
  );
  if (complianceRows.length > 0) {
    await supabase.from("compliance_details").insert(
      complianceRows.map((c) => ({ ...c, org_id: org.id }))
    );
  }

  await logAction(supabase, { actorId: user.id, spId: user.org_id!, action: "create", entityType: "organization", entityLabel: input.name });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClientOrg(id: string, input: ClientInput) {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      name: input.name,
      file_number: input.file_number || null,
      business_type: input.business_type || null,
      date_of_incorporation: input.date_of_incorporation || null,
      logo_url: input.logo_url || null,
      address_line1: input.address_line1 || null,
      address_line2: input.address_line2 || null,
      city: input.city || null,
      state: input.state || null,
      pin_code: input.pin_code || null,
      country: input.country || "India",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("parent_sp_id", user.org_id); // ensure SP owns this client

  if (error) {
    if (error.code === "23505")
      throw new Error(`A client named "${input.name}" already exists.`);
    throw new Error(error.message);
  }

  // Replace all compliance rows (delete + insert)
  await supabase.from("compliance_details").delete().eq("org_id", id);
  const complianceRows = input.compliance.filter(
    (c) => c.number || c.login_id || c.attachment_url
  );
  if (complianceRows.length > 0) {
    await supabase.from("compliance_details").insert(
      complianceRows.map((c) => ({ ...c, org_id: id }))
    );
  }

  await logAction(supabase, { actorId: user.id, spId: user.org_id!, action: "update", entityType: "organization", entityLabel: input.name });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect("/clients");
}

export async function deleteClient(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  const { data: delOrgRef } = await supabase.from("organizations").select("name").eq("id", id).single();
  const delOrgName = delOrgRef?.name ?? id;

  // Hard-delete users belonging to this client org
  await supabase.from("users").delete().eq("org_id", id);

  // Hard-delete appeals and their children
  const { data: appeals } = await supabase
    .from("appeals")
    .select("id")
    .eq("client_org_id", id);

  if (appeals?.length) {
    const appealIds = appeals.map((a) => a.id);

    const { data: proceedings } = await supabase
      .from("proceedings")
      .select("id")
      .in("appeal_id", appealIds);

    if (proceedings?.length) {
      const procIds = proceedings.map((p) => p.id);
      await supabase.from("events").delete().in("proceeding_id", procIds);
      await supabase.from("proceedings").delete().in("id", procIds);
    }

    await supabase.from("appeal_documents").delete().in("appeal_id", appealIds);
    await supabase.from("appeals").delete().in("id", appealIds);
  }

  // Hard-delete the organisation
  const { error } = await supabase.from("organizations").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logAction(supabase, { actorId: user.id, spId: user.org_id!, action: "delete", entityType: "organization", entityLabel: delOrgName });
  revalidatePath("/clients");
}

export async function toggleClientStatus(id: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  const { data: toggleOrgRef } = await supabase.from("organizations").select("name").eq("id", id).single();
  const toggleOrgName = toggleOrgRef?.name ?? id;

  await supabase
    .from("organizations")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("parent_sp_id", user.org_id);

  await logAction(supabase, { actorId: user.id, spId: user.org_id!, action: "update", entityType: "organization", entityLabel: `${toggleOrgName} ${isActive ? "activated" : "deactivated"}` });
  revalidatePath("/clients");
}
