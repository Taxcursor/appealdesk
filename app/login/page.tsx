import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let platformName = "TaxVeteran";
  let description: string | null = "Your AI Tax Attorney";
  let logoUrl: string | null = null;
  let supportEmail: string | null = null;

  try {
    const supabase = await createServiceClient();
    const { data: settings } = await supabase
      .from("platform_settings")
      .select("platform_name, description, logo_url, support_email")
      .single();

    if (settings) {
      platformName = settings.platform_name ?? "TaxVeteran";
      description = settings.description ?? null;
      logoUrl = settings.logo_url ?? null;
      supportEmail = settings.support_email ?? null;
    }
  } catch {
    // Fall back to defaults if platform_settings is unavailable
  }

  return (
    <Suspense fallback={null}>
      <LoginForm
        platformName={platformName}
        description={description}
        logoUrl={logoUrl}
        supportEmail={supportEmail}
      />
    </Suspense>
  );
}
