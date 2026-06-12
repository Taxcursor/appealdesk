// app/(sp)/settings/bulk-import-actions.ts
"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { logAction } from "@/lib/audit";
import type {
  ClientOrgOption,
  ParsedClientRow,
  ParsedTeamUserRow,
  ParsedClientUserRow,
  ValidatedRow,
} from "@/lib/bulk-import/types";

// ─── Date conversion ──────────────────────────────────────────────────────────
// Excel dates come out of getCellText as "DD/MM/YYYY"; PostgreSQL DATE needs "YYYY-MM-DD"
function toPgDate(ddmmyyyy?: string): string | null {
  if (!ddmmyyyy) return null;
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// ─── Template helper ───────────────────────────────────────────────────────────

export async function getClientOrgsForTemplate(): Promise<ClientOrgOption[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") return [];
  const supabase = await createClient();
  const spId = user.service_provider_id ?? user.org_id;
  const { data } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

// ─── DB duplicate validation ───────────────────────────────────────────────────

export async function validateBulkClients(
  rows: ValidatedRow<ParsedClientRow>[]
): Promise<ValidatedRow<ParsedClientRow>[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const validRows = rows.filter((r) => r.status === "valid");
  if (validRows.length === 0) return rows;

  // Read-only: use anon client (RLS scopes orgs to this SP automatically)
  const supabase = await createClient();
  const spId = user.service_provider_id ?? user.org_id;

  const { data: existingOrgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .is("deleted_at", null);

  const existingNames = new Set((existingOrgs ?? []).map((o) => o.name.toLowerCase()));
  const existingOrgIds = (existingOrgs ?? []).map((o) => o.id);

  let existingPANs = new Set<string>();
  if (existingOrgIds.length > 0) {
    const { data: panRows } = await supabase
      .from("compliance_details")
      .select("number")
      .eq("type", "pan")
      .in("org_id", existingOrgIds)
      .not("number", "is", null);
    existingPANs = new Set((panRows ?? []).map((p) => p.number!.toUpperCase()));
  }

  return rows.map((vr) => {
    if (vr.status === "error") return vr;
    if (existingNames.has(vr.row.name.toLowerCase()))
      return { ...vr, status: "error" as const, error: "Client name already exists" };
    const pan = vr.row.pan_number?.toUpperCase();
    if (pan && existingPANs.has(pan))
      return { ...vr, status: "error" as const, error: "PAN already registered" };
    return vr;
  });
}

// Email uniqueness must be global (not SP-scoped), so service client bypasses RLS here
async function checkEmailsExist(emails: string[]): Promise<Set<string>> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("users")
    .select("email")
    .in("email", emails)
    .is("deleted_at", null);
  return new Set((data ?? []).map((u) => u.email.toLowerCase()));
}

export async function validateBulkTeamUsers(
  rows: ValidatedRow<ParsedTeamUserRow>[]
): Promise<ValidatedRow<ParsedTeamUserRow>[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const validRows = rows.filter((r) => r.status === "valid");
  if (validRows.length === 0) return rows;

  const existingEmails = await checkEmailsExist(
    validRows.map((r) => r.row.email.toLowerCase())
  );

  return rows.map((vr) => {
    if (vr.status === "error") return vr;
    if (existingEmails.has(vr.row.email.toLowerCase()))
      return { ...vr, status: "error" as const, error: "Email already registered" };
    return vr;
  });
}

export async function validateBulkClientUsers(
  rows: ValidatedRow<ParsedClientUserRow>[]
): Promise<ValidatedRow<ParsedClientUserRow>[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const validRows = rows.filter((r) => r.status === "valid");
  if (validRows.length === 0) return rows;

  const existingEmails = await checkEmailsExist(
    validRows.map((r) => r.row.email.toLowerCase())
  );

  return rows.map((vr) => {
    if (vr.status === "error") return vr;
    if (existingEmails.has(vr.row.email.toLowerCase()))
      return { ...vr, status: "error" as const, error: "Email already registered" };
    return vr;
  });
}

// ─── Import actions ────────────────────────────────────────────────────────────

export async function importBulkClients(
  rows: ParsedClientRow[]
): Promise<{ successCount: number }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();
  const spId = user.service_provider_id ?? user.org_id;

  // Re-validate server-side: client-submitted rows may bypass client-side validation
  const { data: existingOrgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .is("deleted_at", null);

  const existingNames = new Set((existingOrgs ?? []).map((o) => o.name.toLowerCase()));
  const existingOrgIds = (existingOrgs ?? []).map((o) => o.id);

  let existingPANs = new Set<string>();
  if (existingOrgIds.length > 0) {
    const { data: panRows } = await supabase
      .from("compliance_details")
      .select("number")
      .eq("type", "pan")
      .in("org_id", existingOrgIds)
      .not("number", "is", null);
    existingPANs = new Set((panRows ?? []).map((p) => p.number!.toUpperCase()));
  }

  let successCount = 0;

  for (const row of rows) {
    // Skip rows that fail server-side checks (guards against replayed/manipulated requests)
    if (existingNames.has(row.name.toLowerCase())) continue;
    const pan = row.pan_number?.toUpperCase();
    if (pan && existingPANs.has(pan)) continue;

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: row.name.trim(),
        type: "client",
        parent_sp_id: spId!,
        file_number: row.file_number || null,
        business_type: row.business_type || null,
        date_of_incorporation: toPgDate(row.date_of_incorporation),
        address_line1: row.address_line1 || null,
        address_line2: row.address_line2 || null,
        city: row.city || null,
        state: row.state || null,
        pin_code: row.pin_code || null,
        country: row.country || "India",
        is_active: true,
      })
      .select("id")
      .single();

    if (orgErr || !org) continue;

    // Register inserted name/PAN to prevent intra-batch duplicates
    existingNames.add(row.name.toLowerCase());
    if (pan) existingPANs.add(pan);

    const complianceRows: {
      org_id: string;
      type: string;
      number: string | null;
      login_id: string | null;
      credential: string | null;
    }[] = [
      {
        org_id: org.id,
        type: "pan",
        number: pan ?? null,
        login_id: row.pan_login_id || null,
        credential: row.pan_password || null,
      },
    ];

    if (row.gst_number || row.gst_login_id || row.gst_password) {
      complianceRows.push({
        org_id: org.id,
        type: "gst",
        number: row.gst_number || null,
        login_id: row.gst_login_id || null,
        credential: row.gst_password || null,
      });
    }
    if (row.tan_number || row.tan_login_id || row.tan_password) {
      complianceRows.push({
        org_id: org.id,
        type: "tan",
        number: row.tan_number || null,
        login_id: row.tan_login_id || null,
        credential: row.tan_password || null,
      });
    }
    if (row.aadhaar_number || row.aadhaar_login_id || row.aadhaar_password) {
      complianceRows.push({
        org_id: org.id,
        type: "aadhaar",
        number: row.aadhaar_number || null,
        login_id: row.aadhaar_login_id || null,
        credential: row.aadhaar_password || null,
      });
    }

    const { error: complianceErr } = await supabase
      .from("compliance_details")
      .insert(complianceRows);

    // Rollback org if compliance insert fails (PAN is mandatory)
    if (complianceErr) {
      await supabase
        .from("organizations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", org.id);
      continue;
    }

    successCount++;
  }

  if (successCount > 0) {
    await logAction(supabase, {
      actorId: user.id,
      spId: spId!,
      action: "create",
      entityType: "organization",
      entityLabel: `Bulk imported ${successCount} clients`,
    });
    revalidatePath("/clients");
  }

  return { successCount };
}

export async function importBulkTeamUsers(
  rows: ParsedTeamUserRow[],
  defaultPassword: string
): Promise<{ successCount: number }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");
  if (defaultPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const supabase = await createServiceClient();
  const spId = user.service_provider_id ?? user.org_id;
  let successCount = 0;

  for (const row of rows) {
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: row.email.toLowerCase().trim(),
      password: defaultPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (authErr || !created.user) continue;

    const { error: profileErr } = await supabase.from("users").insert({
      id: created.user.id,
      first_name: row.first_name.trim(),
      middle_name: row.middle_name?.trim() || null,
      last_name: row.last_name.trim(),
      email: row.email.toLowerCase().trim(),
      role: row.role,
      org_id: user.org_id!,
      mobile_country_code: row.mobile_country_code?.trim() || "+91",
      mobile_number: row.mobile_number || null,
      date_of_birth: toPgDate(row.date_of_birth),
      department: row.department || null,
      designation: row.designation || null,
      date_of_joining: toPgDate(row.date_of_joining),
      date_of_leaving: toPgDate(row.date_of_leaving),
      address_line1: row.address_line1 || null,
      address_line2: row.address_line2 || null,
      city: row.city || null,
      pin_code: row.pin_code || null,
      location: row.state || null,        // DB column is `location`, not `state`
      country: row.country || "India",
      pan_number: row.pan_number || null,
      aadhar_number: row.aadhaar_number || null, // DB column is `aadhar_number`
      is_active: true,
    });

    if (profileErr) {
      await supabase.auth.admin.deleteUser(created.user.id);
      continue;
    }

    successCount++;
  }

  if (successCount > 0) {
    await logAction(supabase, {
      actorId: user.id,
      spId: spId!,
      action: "create",
      entityType: "user",
      entityLabel: `Bulk imported ${successCount} team users`,
    });
    revalidatePath("/users");
  }

  return { successCount };
}

export async function importBulkClientUsers(
  rows: ParsedClientUserRow[],
  defaultPassword: string
): Promise<{ successCount: number }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");
  if (defaultPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const supabase = await createServiceClient();
  const spId = user.service_provider_id ?? user.org_id;

  // Resolve org names → IDs server-side (don't trust client-supplied IDs)
  const { data: clientOrgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("parent_sp_id", spId!)
    .eq("type", "client")
    .is("deleted_at", null)
    .eq("is_active", true);

  const orgNameToId = new Map(
    (clientOrgs ?? []).map((o) => [o.name.toLowerCase(), o.id])
  );

  let successCount = 0;

  for (const row of rows) {
    const clientOrgId = orgNameToId.get(row.client_org_name.toLowerCase());
    if (!clientOrgId) continue;

    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: row.email.toLowerCase().trim(),
      password: defaultPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (authErr || !created.user) continue;

    const { error: profileErr } = await supabase.from("users").insert({
      id: created.user.id,
      first_name: row.first_name.trim(),
      middle_name: row.middle_name?.trim() || null,
      last_name: row.last_name.trim(),
      email: row.email.toLowerCase().trim(),
      role: "client",
      org_id: clientOrgId,
      mobile_country_code: "+91",
      mobile_number: row.mobile_number || null,
      date_of_birth: toPgDate(row.date_of_birth),
      is_active: true,
    });

    if (profileErr) {
      await supabase.auth.admin.deleteUser(created.user.id);
      continue;
    }

    const { error: membershipErr } = await supabase.from("user_org_memberships").insert({
      user_id: created.user.id,
      org_id: clientOrgId,
      service_provider_id: spId!,
      is_active: true,
    });

    if (membershipErr) {
      // Soft-delete profile (codebase rule: never hard-delete rows)
      await supabase
        .from("users")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", created.user.id);
      await supabase.auth.admin.deleteUser(created.user.id);
      continue;
    }

    successCount++;
  }

  if (successCount > 0) {
    await logAction(supabase, {
      actorId: user.id,
      spId: spId!,
      action: "create",
      entityType: "user",
      entityLabel: `Bulk imported ${successCount} client users`,
    });
    revalidatePath("/users");
  }

  return { successCount };
}
