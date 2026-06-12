"use server";

import { getCurrentUser } from "@/lib/user";
import { createServiceClient } from "@/lib/supabase/server";

async function getWhitebooksCredentials(spId: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("sp_api_settings")
    .select("whitebooks_client_id, whitebooks_client_secret, whitebooks_email, whitebooks_base_url")
    .eq("service_provider_id", spId)
    .maybeSingle();

  return {
    clientId: data?.whitebooks_client_id ?? "",
    clientSecret: data?.whitebooks_client_secret ?? "",
    email: data?.whitebooks_email ?? "",
    baseUrl: data?.whitebooks_base_url ?? "https://apisandbox.whitebooks.in",
  };
}

export interface GstTaxpayerAddress {
  bno?: string;   // Building number
  bnm?: string;   // Building name
  st?: string;    // Street
  loc?: string;   // Locality
  dst?: string;   // District
  stcd?: string;  // State
  pncd?: string;  // Pin code
  flno?: string;  // Floor number
  lg?: string;    // Longitude
  lt?: string;    // Latitude
}

export interface GstTaxpayerInfo {
  gstin: string;
  lgnm: string;        // Legal name
  tradeNam?: string;   // Trade name
  sts: string;         // Status: Active / Suspended / Cancelled
  dty?: string;        // Taxpayer type: Regular, Composition, etc.
  ctb?: string;        // Constitution of business
  rgdt?: string;       // Registration date
  lstupdt?: string;    // Last updated date
  stj?: string;        // State jurisdiction
  ctj?: string;        // Centre jurisdiction
  nba?: string[];      // Nature of business activities
  einvoiceStatus?: string;
  pradr?: {
    addr: GstTaxpayerAddress;
    ntr?: string;      // Nature of business at this address
  };
  adadr?: Array<{
    addr: GstTaxpayerAddress;
    ntr?: string;
  }>;
}

export interface GstPublicSearchResult {
  success: true;
  data: GstTaxpayerInfo;
}

export interface GstPublicSearchError {
  success: false;
  error: string;
}

export async function fetchGstTaxpayerInfo(
  gstin: string
): Promise<GstPublicSearchResult | GstPublicSearchError> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const spId = user.service_provider_id ?? user.org_id;
  const { clientId, clientSecret, email, baseUrl } = await getWhitebooksCredentials(spId!);

  if (!clientId || !clientSecret || !email) {
    return { success: false, error: "Whitebooks API credentials not configured. Add them in Settings → API Integrations." };
  }

  const url = `${baseUrl}/public/search?email=${encodeURIComponent(email)}&gstin=${encodeURIComponent(gstin)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        client_id: clientId,
        client_secret: clientSecret,
      },
      // No caching — always fresh from GST portal
      cache: "no-store",
    });

    const body = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const msg = (body.message as string) || (body.status_desc as string) || `HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    // Whitebooks uses status_cd "1" for success
    if (body.status_cd !== "1" && body.status_cd !== 1) {
      const msg = (body.status_desc as string) || (body.message as string) || "GST portal returned an error.";
      return { success: false, error: msg };
    }

    const data = body.data as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { success: false, error: "Empty response from GST portal." };
    }

    return { success: true, data: data as unknown as GstTaxpayerInfo };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reach Whitebooks API.",
    };
  }
}
