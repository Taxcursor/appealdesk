import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin" && user.role !== "platform_admin") redirect("/dashboard");

  if (user.must_change_password) redirect("/auth/change-password");

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("platform_name, logo_url")
    .single();

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA]">
      <Sidebar
        userName={`${user.first_name} ${user.last_name}`}
        userRole={user.role}
        isPlatform
        orgName={settings?.platform_name}
        orgLogoUrl={settings?.logo_url ?? undefined}
        userAvatarUrl={user.avatar_url ?? undefined}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
