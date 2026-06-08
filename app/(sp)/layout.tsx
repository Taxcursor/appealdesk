import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";

export default async function SpLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Platform admins should not access SP workspace
  if (user.role === "super_admin" || user.role === "platform_admin") {
    redirect("/platform/dashboard");
  }

  if (user.must_change_password) redirect("/auth/change-password");

  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", spId!)
    .single();

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA]">
      <Sidebar
        userName={`${user.first_name} ${user.last_name}`}
        userRole={user.role}
        orgName={org?.name}
        orgLogoUrl={org?.logo_url ?? undefined}
        userAvatarUrl={user.avatar_url ?? undefined}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
