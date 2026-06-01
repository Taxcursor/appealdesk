"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";

export interface AdminInput {
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  role: "super_admin" | "platform_admin";
  // Contact
  mobile_country_code?: string;
  mobile_number?: string;
  date_of_birth?: string;
  // Employment
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

export async function createPlatformAdmin(input: AdminInput) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") throw new Error("Unauthorized");

  const supabase = await createServiceClient();

  // Check for duplicate email
  const { data: existing } = await supabase.from("users").select("id").eq("email", input.email.toLowerCase().trim()).maybeSingle();
  if (existing) throw new Error("A user with this email already exists.");

  // Send invite — user sets their own password via email link
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
    input.email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      data: { role: input.role },
    }
  );

  if (authError) throw new Error(authError.message);

  // Insert user profile
  const { error: profileError } = await supabase.from("users").insert({
    id: authData.user.id,
    first_name: input.first_name,
    middle_name: input.middle_name || null,
    last_name: input.last_name,
    email: input.email,
    role: input.role,
    org_id: "00000000-0000-0000-0000-000000000001", // Platform org
    mobile_country_code: input.mobile_country_code || "+91",
    mobile_number: input.mobile_number || null,
    date_of_birth: input.date_of_birth || null,
    department: input.department || null,
    designation: input.designation || null,
    date_of_joining: input.date_of_joining || null,
    date_of_leaving: input.date_of_leaving || null,
    address_line1: input.address_line1 || null,
    address_line2: input.address_line2 || null,
    city: input.city || null,
    pin_code: input.pin_code || null,
    location: input.location || null,
    country: input.country || "India",
    pan_number: input.pan_number || null,
    pan_attachment: input.pan_attachment || null,
    aadhar_number: input.aadhar_number || null,
    aadhar_attachment: input.aadhar_attachment || null,
    avatar_url: input.avatar_url || null,
    is_active: true,
  });

  if (profileError) {
    // Rollback auth user if profile insert fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(profileError.message);
  }

  revalidatePath("/platform/admins");
  revalidatePath("/platform/users");
}

export async function toggleAdminStatus(id: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") throw new Error("Unauthorized");
  if (id === user.id) throw new Error("Cannot deactivate your own account");

  const supabase = await createServiceClient();

  await supabase
    .from("users")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/platform/admins");
  revalidatePath("/platform/users");
}
