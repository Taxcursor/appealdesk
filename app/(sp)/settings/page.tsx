import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import SpSettingsClient from "@/components/sp/SpSettingsClient";
import SpApiSettingsClient from "@/components/sp/SpApiSettingsClient";
import { getSpApiSettings } from "@/app/(sp)/settings/actions";
import { getClientOrgsForTemplate } from "./bulk-import-actions";
import BulkImportClient from "@/components/sp/BulkImportClient";

export default async function SpSettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const spId = user?.service_provider_id ?? user?.org_id;
  const isAdmin = user?.role === "sp_admin";

  const [{ data: org }, { data: compliance }, apiSettings, clientOrgs] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", spId!).single(),
    supabase.from("compliance_details").select("*").eq("org_id", spId!),
    getSpApiSettings(),
    isAdmin ? getClientOrgsForTemplate() : Promise.resolve([]),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">Settings</h1>
        <p className="text-[#6B7280] text-sm mt-0.5">
          {isAdmin
            ? "Manage your organisation profile and account."
            : "View your organisation profile and manage your account."}
        </p>
      </div>

      <SpSettingsClient
        org={org}
        compliance={compliance ?? []}
        isAdmin={isAdmin}
      />

      <SpApiSettingsClient
        initial={apiSettings}
        isAdmin={isAdmin}
      />

      {isAdmin && (
        <BulkImportClient clientOrgs={clientOrgs} />
      )}
    </div>
  );
}
