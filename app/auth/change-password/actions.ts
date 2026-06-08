"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";

export async function changePassword(newPassword: string): Promise<string> {
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");

  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (error) throw new Error(error.message);

  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { must_change_password: false },
  });

  return ["super_admin", "platform_admin"].includes(user.role)
    ? "/platform/dashboard"
    : "/dashboard";
}
