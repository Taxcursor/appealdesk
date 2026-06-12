"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";

// ─── API Integration Settings ─────────────────────────────────────────────────

export interface SpApiSettingsInput {
  whitebooks_client_id: string;
  whitebooks_client_secret: string;
  whitebooks_gst_username: string;
  whitebooks_email: string;
  whitebooks_base_url: string;
}

export async function getSpApiSettings(): Promise<SpApiSettingsInput | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createServiceClient();
  const spId = user.service_provider_id ?? user.org_id;

  const { data } = await supabase
    .from("sp_api_settings")
    .select("whitebooks_client_id, whitebooks_client_secret, whitebooks_gst_username, whitebooks_email, whitebooks_base_url")
    .eq("service_provider_id", spId!)
    .maybeSingle();

  return data ?? null;
}

export async function saveSpApiSettings(input: SpApiSettingsInput) {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();
  const spId = user.service_provider_id ?? user.org_id;

  const { error } = await supabase
    .from("sp_api_settings")
    .upsert(
      {
        service_provider_id: spId!,
        whitebooks_client_id: input.whitebooks_client_id.trim() || null,
        whitebooks_client_secret: input.whitebooks_client_secret.trim() || null,
        whitebooks_gst_username: input.whitebooks_gst_username.trim() || null,
        whitebooks_email: input.whitebooks_email.trim() || null,
        whitebooks_base_url: input.whitebooks_base_url.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_provider_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export interface GstSearchTestResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  rawResponse?: Record<string, unknown>;
}

/**
 * Test the Whitebooks /public/search endpoint with credentials passed directly
 * from the settings form — does NOT read from DB, so works before saving.
 */
export async function testGstPublicSearch(
  gstin: string,
  clientId: string,
  clientSecret: string,
  email: string,
  baseUrl: string
): Promise<GstSearchTestResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  if (!clientId || !clientSecret || !email) {
    return { success: false, error: "Client ID, Client Secret and Email are required." };
  }

  const url = `${baseUrl}/public/search?email=${encodeURIComponent(email)}&gstin=${encodeURIComponent(gstin)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "*/*",
        client_id: clientId,
        client_secret: clientSecret,
      },
      cache: "no-store",
    });

    const body = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const msg = (body.message as string) || (body.status_desc as string) || `HTTP ${res.status}`;
      return { success: false, error: msg, rawResponse: body };
    }

    // Whitebooks uses status_cd "1" for success, "0" for failure
    if (body.status_cd !== "1" && body.status_cd !== 1) {
      const msg = (body.status_desc as string) || (body.message as string) || "GST portal returned an error.";
      return { success: false, error: msg, rawResponse: body };
    }

    const data = body.data as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { success: false, error: "Empty response from GST portal.", rawResponse: body };
    }

    return { success: true, data, rawResponse: body };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to reach Whitebooks API." };
  }
}

export interface ComplianceInput {
  type: string;
  number?: string;
  login_id?: string;
  credential?: string;
  attachment_url?: string;
}

export interface SpProfileInput {
  name: string;
  business_type?: string;
  date_of_incorporation?: string;
  logo_url?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  support_email?: string;
}

export async function updateSpProfile(input: SpProfileInput) {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      name: input.name.trim(),
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
    .eq("id", user.org_id)
    .eq("type", "service_provider");

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function saveSpCompliance(compliance: ComplianceInput[]) {
  const user = await getCurrentUser();
  if (!user || user.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  // Replace all compliance rows (delete + insert)
  await supabase.from("compliance_details").delete().eq("org_id", user.org_id);
  const rows = compliance.filter((c) => c.number || c.login_id || c.attachment_url);
  if (rows.length > 0) {
    await supabase.from("compliance_details").insert(
      rows.map((c) => ({ ...c, org_id: user.org_id }))
    );
  }

  revalidatePath("/settings");
}
