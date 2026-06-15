"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { logAction } from "@/lib/audit";

export interface UserInput {
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  password: string;
  role: "sp_admin" | "sp_staff" | "client";
  client_org_id?: string;
  // Contact
  mobile_country_code?: string;
  mobile_number?: string;
  date_of_birth?: string;
  // SP staff/admin only
  department?: string;
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  // Address
  address_line1?: string;
  address_line2?: string;
  city?: string;
  pin_code?: string;
  location?: string;
  country?: string;
  // Identity
  pan_number?: string;
  pan_attachment?: string;
  aadhar_number?: string;
  aadhar_attachment?: string;
  // Avatar
  avatar_url?: string;
}

export async function createUser(input: UserInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  // Check for duplicate email before touching auth
  const { data: existing } = await supabase.from("users").select("id").eq("email", input.email.toLowerCase().trim()).maybeSingle();
  if (existing) throw new Error("A user with this email already exists.");

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });

  if (createError) throw new Error(createError.message);

  // Determine org_id
  const orgId = input.role === "client" && input.client_org_id
    ? input.client_org_id
    : currentUser.org_id;

  const isSpUser = input.role !== "client";

  // Insert public user profile
  const { error: profileError } = await supabase.from("users").insert({
    id: created.user.id,
    first_name: input.first_name,
    middle_name: input.middle_name || null,
    last_name: input.last_name,
    email: input.email,
    role: input.role,
    org_id: orgId,
    mobile_country_code: input.mobile_country_code || "+91",
    mobile_number: input.mobile_number || null,
    date_of_birth: input.date_of_birth || null,
    designation: isSpUser ? (input.designation || null) : null,
    department: isSpUser ? (input.department || null) : null,
    date_of_joining: isSpUser ? (input.date_of_joining || null) : null,
    date_of_leaving: isSpUser ? (input.date_of_leaving || null) : null,
    address_line1: isSpUser ? (input.address_line1 || null) : null,
    address_line2: isSpUser ? (input.address_line2 || null) : null,
    city: isSpUser ? (input.city || null) : null,
    pin_code: isSpUser ? (input.pin_code || null) : null,
    location: isSpUser ? (input.location || null) : null,
    country: isSpUser ? (input.country || "India") : null,
    pan_number: isSpUser ? (input.pan_number || null) : null,
    pan_attachment: isSpUser ? (input.pan_attachment || null) : null,
    aadhar_number: isSpUser ? (input.aadhar_number || null) : null,
    aadhar_attachment: isSpUser ? (input.aadhar_attachment || null) : null,
    avatar_url: input.avatar_url || null,
    is_active: true,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    throw new Error(profileError.message);
  }

  // For client users — create org membership record
  if (input.role === "client" && input.client_org_id) {
    await supabase.from("user_org_memberships").insert({
      user_id: created.user.id,
      org_id: input.client_org_id,
      service_provider_id: currentUser.org_id,
      is_active: true,
    });
  }

  const spId = currentUser.service_provider_id ?? currentUser.org_id;
  await logAction(supabase, { actorId: currentUser.id, spId: spId!, action: "create", entityType: "user", entityLabel: `${input.first_name} ${input.last_name} (${input.email})` });
  revalidatePath("/users");
}

export async function toggleUserStatus(id: string, isActive: boolean) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "sp_admin") throw new Error("Unauthorized");
  if (id === currentUser.id) throw new Error("Cannot deactivate your own account");

  const supabase = await createServiceClient();
  const { data: toggleUserRef } = await supabase.from("users").select("first_name, last_name").eq("id", id).single();
  const toggleUserName = toggleUserRef ? `${toggleUserRef.first_name} ${toggleUserRef.last_name}` : id;

  await supabase
    .from("users")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  const spId = currentUser.service_provider_id ?? currentUser.org_id;
  await logAction(supabase, { actorId: currentUser.id, spId: spId!, action: "update", entityType: "user", entityLabel: `${toggleUserName} ${isActive ? "activated" : "deactivated"}` });
  revalidatePath("/users");
}

export interface UserEditInput {
  first_name: string;
  middle_name?: string;
  last_name: string;
  role: "sp_admin" | "sp_staff" | "client";
  client_org_id?: string;
  new_password?: string; // blank = don't change
  // Contact
  mobile_country_code?: string;
  mobile_number?: string;
  date_of_birth?: string;
  // SP staff/admin only
  department?: string;
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  // Address
  address_line1?: string;
  address_line2?: string;
  city?: string;
  pin_code?: string;
  location?: string;
  country?: string;
  // Identity
  pan_number?: string;
  pan_attachment?: string;
  aadhar_number?: string;
  aadhar_attachment?: string;
  // Avatar
  avatar_url?: string;
}

export async function updateUser(id: string, input: UserEditInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "sp_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();
  const isSpUser = input.role !== "client";

  // Determine org_id for client users (changing org)
  const orgUpdate = input.role === "client" && input.client_org_id
    ? { org_id: input.client_org_id }
    : {};

  const { error } = await supabase.from("users").update({
    first_name: input.first_name,
    middle_name: input.middle_name || null,
    last_name: input.last_name,
    role: input.role,
    ...orgUpdate,
    mobile_country_code: input.mobile_country_code || "+91",
    mobile_number: input.mobile_number || null,
    date_of_birth: input.date_of_birth || null,
    designation: isSpUser ? (input.designation || null) : null,
    department: isSpUser ? (input.department || null) : null,
    date_of_joining: isSpUser ? (input.date_of_joining || null) : null,
    date_of_leaving: isSpUser ? (input.date_of_leaving || null) : null,
    address_line1: isSpUser ? (input.address_line1 || null) : null,
    address_line2: isSpUser ? (input.address_line2 || null) : null,
    city: isSpUser ? (input.city || null) : null,
    pin_code: isSpUser ? (input.pin_code || null) : null,
    location: isSpUser ? (input.location || null) : null,
    country: isSpUser ? (input.country || "India") : null,
    pan_number: isSpUser ? (input.pan_number || null) : null,
    pan_attachment: isSpUser ? (input.pan_attachment || null) : null,
    aadhar_number: isSpUser ? (input.aadhar_number || null) : null,
    aadhar_attachment: isSpUser ? (input.aadhar_attachment || null) : null,
    avatar_url: input.avatar_url || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) throw new Error(error.message);

  // Update password if provided
  if (input.new_password && input.new_password.length >= 8) {
    const { error: pwError } = await supabase.auth.admin.updateUserById(id, {
      password: input.new_password,
    });
    if (pwError) throw new Error(pwError.message);
  }

  const spId = currentUser.service_provider_id ?? currentUser.org_id;
  await logAction(supabase, { actorId: currentUser.id, spId: spId!, action: "update", entityType: "user", entityLabel: `${input.first_name} ${input.last_name}` });
  revalidatePath("/users");
}

export async function deleteUser(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "sp_admin") throw new Error("Unauthorized");
  if (id === currentUser.id) throw new Error("Cannot delete your own account");

  const supabase = await createServiceClient();

  const { data: delUserRef } = await supabase.from("users").select("first_name, last_name, email").eq("id", id).single();
  const delUserName = delUserRef ? `${delUserRef.first_name} ${delUserRef.last_name} (${delUserRef.email})` : id;

  // Hard-delete: remove row from database
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  const spId = currentUser.service_provider_id ?? currentUser.org_id;
  await logAction(supabase, { actorId: currentUser.id, spId: spId!, action: "delete", entityType: "user", entityLabel: delUserName });
  revalidatePath("/users");
}
