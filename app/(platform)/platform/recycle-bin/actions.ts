"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";

function platformOnly(role: string) {
  if (!["super_admin", "platform_admin"].includes(role)) throw new Error("Unauthorized");
}

export async function restorePlatformUser(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();
  await supabase.from("users").update({ deleted_at: null, is_active: true }).eq("id", id);

  revalidatePath("/platform/recycle-bin");
  revalidatePath("/platform/users");
  revalidatePath("/platform/providers");
}

export async function purgePlatformUser(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();
  await supabase.from("users").delete().eq("id", id);
  await supabase.auth.admin.deleteUser(id);

  revalidatePath("/platform/recycle-bin");
  revalidatePath("/platform/users");
  revalidatePath("/platform/providers");
}

export async function restoreProvider(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();

  // Restore the organization
  await supabase
    .from("organizations")
    .update({ deleted_at: null, is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  // Restore all users that were cascade-deleted with this SP
  await supabase
    .from("users")
    .update({ deleted_at: null, is_active: true })
    .eq("org_id", id)
    .not("deleted_at", "is", null);

  revalidatePath("/platform/recycle-bin");
  revalidatePath("/platform/providers");
}

export async function purgeProvider(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();

  // Fetch all users in this org so we can remove them from auth too
  const { data: orgUsers } = await supabase
    .from("users")
    .select("id")
    .eq("org_id", id);

  // Hard-delete each user from auth
  if (orgUsers) {
    for (const u of orgUsers) {
      await supabase.auth.admin.deleteUser(u.id);
    }
  }

  // Delete all user rows for this org
  await supabase.from("users").delete().eq("org_id", id);

  // Delete the organization itself
  await supabase.from("organizations").delete().eq("id", id);

  revalidatePath("/platform/recycle-bin");
  revalidatePath("/platform/providers");
}

export async function restoreMasterRecord(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();
  // Restore children first, then the record itself
  await supabase.from("master_records").update({ deleted_at: null, is_active: true }).eq("parent_id", id);
  await supabase.from("master_records").update({ deleted_at: null, is_active: true }).eq("id", id);

  revalidatePath("/platform/recycle-bin");
  revalidatePath("/platform/masters");
}

export async function purgeMasterRecord(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();
  // Delete children first, then the record
  await supabase.from("master_records").delete().eq("parent_id", id);
  await supabase.from("master_records").delete().eq("id", id);

  revalidatePath("/platform/recycle-bin");
  revalidatePath("/platform/masters");
}

export async function restoreClient(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();

  // Restore the client organization
  await supabase
    .from("organizations")
    .update({ deleted_at: null, is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  // Restore all users that were cascade-deleted with this client
  await supabase
    .from("users")
    .update({ deleted_at: null, is_active: true })
    .eq("org_id", id)
    .not("deleted_at", "is", null);

  revalidatePath("/platform/recycle-bin");
}

export async function purgeClient(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  platformOnly(user.role);

  const supabase = await createServiceClient();

  // Fetch all users in this org so we can remove them from auth too
  const { data: orgUsers } = await supabase
    .from("users")
    .select("id")
    .eq("org_id", id);

  // Hard-delete each user from auth
  if (orgUsers) {
    for (const u of orgUsers) {
      await supabase.auth.admin.deleteUser(u.id);
    }
  }

  // Delete all user rows for this org
  await supabase.from("users").delete().eq("org_id", id);

  // Delete the organization itself
  await supabase.from("organizations").delete().eq("id", id);

  revalidatePath("/platform/recycle-bin");
}
