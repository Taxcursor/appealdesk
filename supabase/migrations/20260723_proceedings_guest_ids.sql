-- Adds a dedicated proceedings.guest_ids column for granting guest_manager/
-- guest_user access to a specific proceeding — separate from
-- assigned_to_ids, which is staff assignment (sp_admin/sp_staff/director).
-- Mixing the two in one array risked a staff-assignment edit silently
-- revoking (or a guest UI silently granting) the wrong kind of access.
ALTER TABLE proceedings ADD COLUMN IF NOT EXISTS guest_ids uuid[] DEFAULT '{}'::uuid[];

-- Re-point every guest_manager/guest_user RLS check from assigned_to_ids to
-- guest_ids. Run after 20260721_rls_guest_proceeding_scope.sql,
-- 20260722_fix_appeals_guest_rls_recursion.sql, and
-- 20260722_restrict_guest_sp_wide_access.sql.

CREATE OR REPLACE FUNCTION "public"."is_guest_assigned_to_appeal"(target_appeal_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM proceedings p
    WHERE p.appeal_id = target_appeal_id AND p.guest_ids @> ARRAY[auth.uid()]
  )
$$;

CREATE OR REPLACE FUNCTION "public"."is_guest_client_org"(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM appeals a
    JOIN proceedings p ON p.appeal_id = a.id
    WHERE a.client_org_id = target_org_id AND p.guest_ids @> ARRAY[auth.uid()]
  )
$$;

DROP POLICY IF EXISTS "proceedings_select" ON "public"."proceedings";
CREATE POLICY "proceedings_select" ON "public"."proceedings" FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR service_provider_id = get_my_sp_id()
  OR EXISTS (
    SELECT 1 FROM appeals a
    WHERE a.id = appeal_id AND (
      a.client_org_id = get_my_org_id()
      OR a.client_org_id IN (
        SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid() AND is_active = true
      )
    )
  )
  OR (
    get_my_role() IN ('guest_manager', 'guest_user')
    AND guest_ids @> ARRAY[auth.uid()]
  )
);

DROP POLICY IF EXISTS "events_select" ON "public"."events";
CREATE POLICY "events_select" ON "public"."events" FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR service_provider_id = get_my_sp_id()
  OR EXISTS (
    SELECT 1 FROM proceedings p
    JOIN appeals a ON a.id = p.appeal_id
    WHERE p.id = proceeding_id AND (
      a.client_org_id = get_my_org_id()
      OR a.client_org_id IN (
        SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid() AND is_active = true
      )
    )
  )
  OR (
    get_my_role() IN ('guest_manager', 'guest_user')
    AND EXISTS (
      SELECT 1 FROM proceedings p
      WHERE p.id = proceeding_id AND p.guest_ids @> ARRAY[auth.uid()]
    )
  )
);
