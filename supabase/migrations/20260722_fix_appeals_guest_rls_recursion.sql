-- Fixes "infinite recursion detected in policy for relation appeals".
--
-- appeals_select's guest_manager/guest_user branch (added in
-- 20260721_rls_guest_proceeding_scope.sql) queried proceedings directly via
-- a plain EXISTS subquery. proceedings_select already queries appeals (for
-- the client-access branch). That makes the two policies mutually
-- recursive: evaluating appeals RLS requires evaluating proceedings RLS,
-- which requires evaluating appeals RLS, forever.
--
-- Fix: move the proceedings lookup into a SECURITY DEFINER function, same
-- technique get_my_role()/get_my_org_id()/get_my_sp_id() already use —
-- SECURITY DEFINER functions run as their owner (bypassing RLS on tables
-- they query), so this breaks the cycle without changing who can see what.

CREATE OR REPLACE FUNCTION "public"."is_guest_assigned_to_appeal"(target_appeal_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM proceedings p
    WHERE p.appeal_id = target_appeal_id AND p.assigned_to_ids @> ARRAY[auth.uid()]
  )
$$;

GRANT EXECUTE ON FUNCTION "public"."is_guest_assigned_to_appeal"(uuid) TO authenticated;

DROP POLICY IF EXISTS "appeals_select" ON "public"."appeals";
CREATE POLICY "appeals_select" ON "public"."appeals" FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR service_provider_id = get_my_sp_id()
  OR client_org_id IN (
    SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid() AND is_active = true
  )
  OR client_org_id = get_my_org_id()
  OR (
    get_my_role() IN ('guest_manager', 'guest_user')
    AND is_guest_assigned_to_appeal(appeals.id)
  )
);
