-- get_my_sp_id() previously only recognized sp_admin/sp_staff (org_id) and
-- client (parent_sp_id). director/guest_manager/guest_user are SP-org-native
-- users, same as sp_admin/sp_staff — without this fix they resolve to a null
-- service_provider_id and every service_provider_id = get_my_sp_id() RLS
-- clause silently excludes them everywhere.
--
-- Run this AFTER 20260721_add_director_role.sql,
-- 20260721_add_guest_manager_role.sql, and 20260721_add_guest_user_role.sql
-- have each been committed as their own statement — a new enum value cannot
-- be referenced in the same transaction it was added in.
CREATE OR REPLACE FUNCTION "public"."get_my_sp_id"()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE
    WHEN u.role IN ('sp_admin', 'sp_staff', 'director', 'guest_manager', 'guest_user') THEN u.org_id
    WHEN u.role = 'client' THEN o.parent_sp_id
    ELSE NULL
  END
  FROM users u
  JOIN organizations o ON o.id = u.org_id
  WHERE u.id = auth.uid()
$$;
