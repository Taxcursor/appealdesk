"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";

function spOnly(role: string) {
  if (!["sp_admin", "sp_staff"].includes(role)) throw new Error("Unauthorized");
}

export async function addDocument(appealId: string, fileName: string, fileUrl: string, fileSize: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { error } = await supabase.from("appeal_documents").insert({
    appeal_id: appealId,
    service_provider_id: spId,
    file_name: fileName,
    file_url: fileUrl,
    file_size: fileSize,
    uploaded_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/litigations/${appealId}`);
  revalidatePath("/documents");
}

export async function deleteDocument(documentId: string, appealId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("appeal_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/litigations/${appealId}`);
  revalidatePath("/documents");
}

// ── FORMS ──────────────────────────────────────────────

export interface FormInput {
  rule_no?: string;
  rule_heading: string;
  form_no?: string;
  page_no?: string;
  parallel_rule_1962?: string;
  url?: string;
  file_name?: string;
  file_url?: string;
  file_size?: number;
}

export async function createForm(input: FormInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { data: existing } = await supabase
    .from("forms")
    .select("sort_order")
    .eq("service_provider_id", spId!)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("forms").insert({
    service_provider_id: spId,
    rule_no: input.rule_no || null,
    rule_heading: input.rule_heading,
    form_no: input.form_no || null,
    page_no: input.page_no || null,
    parallel_rule_1962: input.parallel_rule_1962 || null,
    url: input.url || null,
    file_name: input.file_name || null,
    file_url: input.file_url || null,
    file_size: input.file_size || null,
    sort_order: nextOrder,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

export async function updateForm(id: string, input: FormInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const updatePayload: Record<string, unknown> = {
    rule_no: input.rule_no || null,
    rule_heading: input.rule_heading,
    form_no: input.form_no || null,
    page_no: input.page_no || null,
    parallel_rule_1962: input.parallel_rule_1962 || null,
    url: input.url || null,
    updated_at: new Date().toISOString(),
  };
  if (input.file_url !== undefined) {
    updatePayload.file_name = input.file_name || null;
    updatePayload.file_url = input.file_url || null;
    updatePayload.file_size = input.file_size || null;
  }

  const { error } = await supabase.from("forms").update(updatePayload).eq("id", id).eq("service_provider_id", spId!);

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

export async function deleteForm(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  await supabase.from("forms").delete().eq("id", id).eq("service_provider_id", spId!);
  revalidatePath("/documents");
}

export async function removeFormFile(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { error } = await supabase.from("forms").update({ file_name: null, file_url: null, file_size: null }).eq("id", id).eq("service_provider_id", spId!);
  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

// ── TEMPLATES ──────────────────────────────────────────

export interface TemplateInput {
  name: string;
  description?: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
}

export async function createTemplate(input: TemplateInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { error } = await supabase.from("templates").insert({
    service_provider_id: spId,
    created_by: user.id,
    name: input.name,
    description: input.description || null,
    file_url: input.file_url,
    file_type: input.file_type || null,
    file_size: input.file_size || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

export async function updateTemplate(id: string, input: Pick<TemplateInput, "name" | "description">) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { error } = await supabase.from("templates").update({
    name: input.name,
    description: input.description || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("service_provider_id", spId!);

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

export async function deleteTemplate(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  await supabase.from("templates").delete().eq("id", id).eq("service_provider_id", spId!);
  revalidatePath("/documents");
}

// ── RESOURCES ──────────────────────────────────────────

export interface ResourceInput {
  act_id: string;
  section?: string;
  rule?: string;
  description: string;
  author?: string;
}

export async function createResource(input: ResourceInput): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { data, error } = await supabase.from("resources").insert({
    service_provider_id: spId,
    act_id: input.act_id,
    section: input.section || null,
    rule: input.rule || null,
    description: input.description,
    author: input.author || null,
    created_by: user.id,
  }).select("id").single();

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
  return data.id;
}

export async function updateResource(id: string, input: ResourceInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  const { error } = await supabase.from("resources").update({
    act_id: input.act_id,
    section: input.section || null,
    rule: input.rule || null,
    description: input.description,
    author: input.author || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("service_provider_id", spId!);

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

export async function deleteResource(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const spId = user.service_provider_id ?? user.org_id;
  const supabase = await createServiceClient();

  await supabase.from("resources").delete().eq("id", id).eq("service_provider_id", spId!);
  revalidatePath("/documents");
}

export async function addResourceFile(resourceId: string, fileName: string, fileUrl: string, fileType?: string, fileSize?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const supabase = await createServiceClient();

  const { error } = await supabase.from("resource_files").insert({
    resource_id: resourceId,
    file_name: fileName,
    file_url: fileUrl,
    file_type: fileType || null,
    file_size: fileSize || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}

export async function deleteResourceFile(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  spOnly(user.role);
  const supabase = await createServiceClient();

  const { error } = await supabase.from("resource_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
  revalidatePath("/documents");
}
