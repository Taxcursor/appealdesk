import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import SpSettingsClient from "@/components/sp/SpSettingsClient";
import SpApiSettingsClient from "@/components/sp/SpApiSettingsClient";
import { getSpApiSettings } from "@/app/(sp)/settings/actions";
import { getClientOrgsForTemplate } from "./bulk-import-actions";
import BulkImportClient from "@/components/sp/BulkImportClient";

type Tab = "profile" | "api" | "bulk";

export default async function SpSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const spId = user?.service_provider_id ?? user?.org_id;
  const isAdmin = user?.role === "sp_admin";

  const rawTab = params.tab as string | undefined;
  const currentTab: Tab =
    rawTab === "api" ? "api" : rawTab === "bulk" && isAdmin ? "bulk" : "profile";

  const [{ data: org }, { data: compliance }, apiSettings, clientOrgs] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", spId!).single(),
    supabase.from("compliance_details").select("*").eq("org_id", spId!),
    getSpApiSettings(),
    isAdmin ? getClientOrgsForTemplate() : Promise.resolve([]),
  ]);

  const tabs: { tab: Tab; label: string }[] = [
    { tab: "profile", label: "Organisation Profile" },
    { tab: "api", label: "API Integrations" },
    ...(isAdmin ? ([{ tab: "bulk", label: "Bulk Import" }] as { tab: Tab; label: string }[]) : []),
  ];

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

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-[#E5E7EB] rounded-xl p-1 shadow-sm mb-6 w-fit">
        {tabs.map(({ tab, label }) => (
          <Link
            key={tab}
            href={tab === "profile" ? "/settings" : `/settings?tab=${tab}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              currentTab === tab
                ? "bg-[#1E3A5F] text-white"
                : "text-[#6B7280] hover:text-[#1A1A2E] hover:bg-[#F8F9FA]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Tab content */}
      {currentTab === "profile" && (
        <SpSettingsClient
          org={org}
          compliance={compliance ?? []}
          isAdmin={isAdmin}
        />
      )}

      {currentTab === "api" && (
        <SpApiSettingsClient
          initial={apiSettings}
          isAdmin={isAdmin}
        />
      )}

      {currentTab === "bulk" && isAdmin && (
        <BulkImportClient clientOrgs={clientOrgs} />
      )}
    </div>
  );
}
