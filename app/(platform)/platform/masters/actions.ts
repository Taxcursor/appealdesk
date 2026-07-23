"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { logAction } from "@/lib/audit";

export async function createMasterRecord(name: string, type: string) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "super_admin" && user.role !== "platform_admin")
  ) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServiceClient();

  const { error } = await supabase.from("master_records").insert({
    name,
    type,
    level: "platform",
    service_provider_id: null,
    is_active: true,
  });

  if (error) throw new Error(error.message);

  await logAction(supabase, {
    actorId: user.id,
    spId: null,
    action: "create",
    entityType: "master_record",
    entityLabel: `${type}: ${name}`,
  });

  revalidatePath("/platform/masters");
}

export async function renameMasterRecord(id: string, newName: string) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "super_admin" && user.role !== "platform_admin")
  ) {
    throw new Error("Unauthorized");
  }
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("master_records")
    .update({ name: newName.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("type")
    .single();
  if (error) throw new Error(error.message);

  await logAction(supabase, {
    actorId: user.id,
    spId: null,
    action: "update",
    entityType: "master_record",
    entityLabel: `${data.type}: ${newName.trim()}`,
  });

  revalidatePath("/platform/masters");
}

export async function createChildMasterRecord(
  name: string,
  type: string,
  parentId: string,
) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "super_admin" && user.role !== "platform_admin")
  ) {
    throw new Error("Unauthorized");
  }
  const supabase = await createServiceClient();
  const { error } = await supabase.from("master_records").insert({
    name: name.trim(),
    type,
    level: "platform",
    parent_id: parentId,
    is_active: true,
  });
  if (error) throw new Error(error.message);

  await logAction(supabase, {
    actorId: user.id,
    spId: null,
    action: "create",
    entityType: "master_record",
    entityLabel: `${type}: ${name.trim()}`,
  });

  revalidatePath("/platform/masters");
}

export async function toggleMasterRecord(id: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "super_admin" && user.role !== "platform_admin")
  ) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("master_records")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("type, name")
    .single();

  await logAction(supabase, {
    actorId: user.id,
    spId: null,
    action: "update",
    entityType: "master_record",
    entityLabel: data
      ? `${isActive ? "Activated" : "Deactivated"} ${data.type}: ${data.name}`
      : undefined,
  });

  revalidatePath("/platform/masters");
}

export async function deleteMasterRecord(id: string) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "super_admin" && user.role !== "platform_admin")
  ) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("master_records")
    .select("type, name")
    .eq("id", id)
    .single();

  // Cascade hard-delete children (proceeding types under this act)
  await supabase
    .from("master_records")
    .delete()
    .eq("parent_id", id);
  await supabase
    .from("master_records")
    .delete()
    .eq("id", id);

  await logAction(supabase, {
    actorId: user.id,
    spId: null,
    action: "delete",
    entityType: "master_record",
    entityLabel: data ? `${data.type}: ${data.name}` : undefined,
  });

  revalidatePath("/platform/masters");
}
