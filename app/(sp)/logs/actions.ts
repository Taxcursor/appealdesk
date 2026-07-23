"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";

export interface LogFilters {
  filterActions: string[];
  filterEntities: string[];
  filterClientNames: string[]; // resolved org names used for ilike on entity_label
  fromDate: string;
  toDate: string;
}

export async function exportLogs(filters: LogFilters) {
  const user = await getCurrentUser();
  if (!user || !["sp_admin", "director"].includes(user.role)) throw new Error("Unauthorized");

  const supabase = await createClient();
  const spId = user.service_provider_id ?? user.org_id;

  let q = supabase
    .from("audit_logs")
    .select(`id, action, entity_type, entity_label, created_at, actor:users!actor_id(first_name, last_name, role)`)
    .eq("service_provider_id", spId!)
    .order("created_at", { ascending: false });

  if (filters.filterActions.length)   q = q.in("action", filters.filterActions);
  if (filters.filterEntities.length)  q = q.in("entity_type", filters.filterEntities);
  if (filters.filterClientNames.length) {
    const orCondition = filters.filterClientNames
      .map((n) => `entity_label.ilike.%${n}%`)
      .join(",");
    q = q.or(orCondition);
  }
  if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
  if (filters.toDate)   q = q.lte("created_at", filters.toDate + "T23:59:59");

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}
