-- Adds guest_manager/guest_user read access to proceedings/events/appeals,
-- scoped strictly to rows where auth.uid() appears in
-- proceedings.assigned_to_ids. This is intentionally NARROWER than the
-- existing service_provider_id = get_my_sp_id() branch used by
-- sp_admin/sp_staff/director — guests never get SP-wide access, only their
-- personally assigned proceeding(s) and those proceedings' parent litigation
-- (for the read-only litigation summary) and events.
--
-- No UPDATE/DELETE policies are added here — consistent with this schema's
-- existing pattern where appeals/proceedings/events have no DELETE policies
-- at all (every write goes through the service-role client in Server
-- Actions, which bypasses RLS by design). Guest write authorization is
-- enforced at the app layer instead, via lib/guestProceedingAuth.ts.
--
-- Run this AFTER 20260721_update_get_my_sp_id_for_new_roles.sql.

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
    AND assigned_to_ids @> ARRAY[auth.uid()]
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
      WHERE p.id = proceeding_id AND p.assigned_to_ids @> ARRAY[auth.uid()]
    )
  )
);

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
    AND EXISTS (
      SELECT 1 FROM proceedings p
      WHERE p.appeal_id = appeals.id AND p.assigned_to_ids @> ARRAY[auth.uid()]
    )
  )
);
