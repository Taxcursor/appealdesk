-- Fixes an over-broad access bug: get_my_sp_id() (widened in
-- 20260721_update_get_my_sp_id_for_new_roles.sql to resolve for
-- guest_manager/guest_user too) is used in an UNCONDITIONAL
-- "service_provider_id = get_my_sp_id()" pattern across most RLS policies
-- (organizations, compliance_details, users, master_records, appeals,
-- proceedings, events). Making it resolve for guest roles meant they now
-- match that branch on EVERY row belonging to their SP — full SP-wide read
-- access, not just their assigned proceeding(s). That defeats the entire
-- point of assignment-scoping.
--
-- Fix: get_my_sp_id() reverts to NOT resolving for guest_manager/guest_user
-- (it still resolves for sp_admin/sp_staff/director, who are meant to have
-- full SP access). The app-level SessionUser.service_provider_id (lib/user.ts)
-- is unaffected by this — it's computed independently in JS and every
-- consumer already falls back to `?? user.org_id`, so nothing there breaks.
--
-- Guests still need to read the ONE client org tied to their assigned
-- proceeding's litigation (for the read-only litigation summary), so
-- organizations_select gets a narrow, SECURITY DEFINER-backed guest branch
-- instead of the blanket get_my_sp_id() match.

CREATE OR REPLACE FUNCTION "public"."get_my_sp_id"()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE
    WHEN u.role IN ('sp_admin', 'sp_staff', 'director') THEN u.org_id
    WHEN u.role = 'client' THEN o.parent_sp_id
    ELSE NULL
  END
  FROM users u
  JOIN organizations o ON o.id = u.org_id
  WHERE u.id = auth.uid()
$$;

-- Bypasses RLS on appeals/proceedings (SECURITY DEFINER) to check whether
-- target_org_id is the client org of a litigation containing a proceeding
-- the caller is assigned to — without querying organizations itself, so
-- this can't create a recursion cycle with organizations_select.
CREATE OR REPLACE FUNCTION "public"."is_guest_client_org"(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM appeals a
    JOIN proceedings p ON p.appeal_id = a.id
    WHERE a.client_org_id = target_org_id AND p.assigned_to_ids @> ARRAY[auth.uid()]
  )
$$;

GRANT EXECUTE ON FUNCTION "public"."is_guest_client_org"(uuid) TO authenticated;

DROP POLICY IF EXISTS "organizations_select" ON "public"."organizations";
CREATE POLICY "organizations_select" ON "public"."organizations" FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR id = get_my_org_id()
  OR id = get_my_sp_id()
  OR parent_sp_id = get_my_sp_id()
  OR (
    get_my_role() IN ('guest_manager', 'guest_user')
    AND is_guest_client_org(organizations.id)
  )
);
