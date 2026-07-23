-- ============================================================
-- AppealDesk — Multi-Tenant Schema
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────
CREATE TYPE org_type AS ENUM ('platform', 'service_provider', 'client');
CREATE TYPE user_role AS ENUM ('super_admin', 'platform_admin', 'sp_admin', 'sp_staff', 'director', 'guest_manager', 'guest_user', 'client');
CREATE TYPE business_type AS ENUM ('Company', 'Trust', 'Partnership', 'LLP', 'Sole Proprietorship', 'OPC', 'Custom');
CREATE TYPE compliance_type AS ENUM ('pan', 'aadhaar', 'tan', 'gst');
CREATE TYPE master_level AS ENUM ('platform', 'service_provider');
CREATE TYPE importance_level AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE possible_outcome AS ENUM ('favourable', 'doubtful', 'unfavourable');
CREATE TYPE proceeding_mode AS ENUM ('online', 'offline');
CREATE TYPE notice_status AS ENUM ('open', 'in_progress', 'closed');
CREATE TYPE event_category AS ENUM (
  'notice_from_authority',
  'response_to_notice',
  'adjournment_request',
  'personal_hearing',
  'virtual_hearing',
  'personal_follow_up',
  'assessment_order',
  'notice_of_penalty',
  'penalty_order'
);

-- ─── ORGANIZATIONS ────────────────────────────────────────────
CREATE TABLE organizations (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  text NOT NULL,
  type                  org_type NOT NULL,
  parent_sp_id          uuid REFERENCES organizations(id) ON DELETE SET NULL,
  business_type         business_type,
  date_of_incorporation date,
  logo_url              text,
  address_line1         text,
  address_line2         text,
  city                  text,
  pin_code              text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── COMPLIANCE DETAILS ───────────────────────────────────────
-- Stores PAN / Aadhaar / TAN / GST per organization
CREATE TABLE compliance_details (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type           compliance_type NOT NULL,
  number         text,
  login_id       text,
  -- Note: store passwords encrypted at app level; never store plaintext in production
  credential     text,
  attachment_url text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, type)
);

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE users (
  id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name           text NOT NULL,
  middle_name          text,
  last_name            text NOT NULL,
  email                text NOT NULL UNIQUE,
  mobile_country_code  text DEFAULT '+91',
  mobile_number        text,
  date_of_birth        date,
  profile_picture_url  text,
  role                 user_role NOT NULL,
  org_id               uuid NOT NULL REFERENCES organizations(id),
  department           text,
  designation          text,
  date_of_joining      date,
  date_of_leaving      date,
  address_line1        text,
  address_line2        text,
  city                 text,
  pin_code             text,
  pan_number           text,
  pan_attachment_url   text,
  aadhaar_number       text,
  aadhaar_attachment_url text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── USER ORG MEMBERSHIPS ─────────────────────────────────────
-- Allows client users to be linked to multiple service providers
CREATE TABLE user_org_memberships (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_provider_id uuid NOT NULL REFERENCES organizations(id),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

-- ─── MASTER RECORDS ───────────────────────────────────────────
CREATE TABLE master_records (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                text NOT NULL,
  type                text NOT NULL,  -- 'business_type', 'appeal_status', 'department', etc.
  level               master_level NOT NULL DEFAULT 'platform',
  service_provider_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_records_no_sp CHECK (
    (level = 'platform' AND service_provider_id IS NULL) OR
    (level = 'service_provider' AND service_provider_id IS NOT NULL)
  )
);

-- ─── APPEALS ─────────────────────────────────────────────────
CREATE TABLE appeals (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_provider_id uuid NOT NULL REFERENCES organizations(id),
  client_org_id       uuid NOT NULL REFERENCES organizations(id),
  act_regulation      text,
  assessment_year     text,
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── PROCEEDINGS ─────────────────────────────────────────────
CREATE TABLE proceedings (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  appeal_id           uuid NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  service_provider_id uuid NOT NULL REFERENCES organizations(id),
  proceeding_type     text,
  authority_type      text CHECK (authority_type IN ('assessing', 'appellate')),
  authority_name      text,
  jurisdiction        text,
  jurisdiction_address text,
  jurisdiction_city   text,
  importance          importance_level,
  mode                proceeding_mode,
  initiated_on        date,
  to_be_completed_by  date,
  assigned_to         uuid REFERENCES users(id),
  possible_outcome    possible_outcome,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Junction: proceedings ↔ client users
CREATE TABLE proceeding_client_users (
  proceeding_id uuid NOT NULL REFERENCES proceedings(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (proceeding_id, user_id)
);

-- ─── EVENTS ──────────────────────────────────────────────────
CREATE TABLE events (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  proceeding_id       uuid NOT NULL REFERENCES proceedings(id) ON DELETE CASCADE,
  service_provider_id uuid NOT NULL REFERENCES organizations(id),
  category            event_category NOT NULL,
  event_date          timestamptz,
  description         text,
  details             jsonb NOT NULL DEFAULT '{}',  -- category-specific fields
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── EVENT ATTACHMENTS ───────────────────────────────────────
CREATE TABLE event_attachments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_size   integer,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── TIME TRACKING ───────────────────────────────────────────
CREATE TABLE time_entries (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  appeal_id           uuid NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  service_provider_id uuid NOT NULL REFERENCES organizations(id),
  team_member_id      uuid NOT NULL REFERENCES users(id),
  activity            text NOT NULL,
  date                date NOT NULL,
  from_time           time NOT NULL,
  to_time             time NOT NULL,
  duration_minutes    integer GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (to_time - from_time)) / 60
  ) STORED,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── EXPENSES ────────────────────────────────────────────────
CREATE TABLE expenses (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  appeal_id           uuid NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  service_provider_id uuid NOT NULL REFERENCES organizations(id),
  expense_type        text NOT NULL,
  amount              numeric(12, 2) NOT NULL,
  attachment_url      text,
  notes               text,
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── DOCUMENTS ───────────────────────────────────────────────
CREATE TABLE templates (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_provider_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  file_url            text NOT NULL,
  file_type           text,
  file_size           integer,
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forms (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_provider_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_no             text,
  rule_heading        text,
  form_no             text,
  page_no             text,
  parallel_rule       text,
  url                 text,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── ACTIVITY LOGS ───────────────────────────────────────────
CREATE TABLE activity_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_provider_id uuid REFERENCES organizations(id),
  user_id             uuid NOT NULL REFERENCES users(id),
  action              text NOT NULL,
  entity_type         text,
  entity_id           uuid,
  metadata            jsonb DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_parent_sp_id ON organizations(parent_sp_id);
CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_user_org_memberships_user_id ON user_org_memberships(user_id);
CREATE INDEX idx_user_org_memberships_sp_id ON user_org_memberships(service_provider_id);
CREATE INDEX idx_master_records_type_level ON master_records(type, level);
CREATE INDEX idx_master_records_sp_id ON master_records(service_provider_id);
CREATE INDEX idx_appeals_sp_id ON appeals(service_provider_id);
CREATE INDEX idx_appeals_client_org_id ON appeals(client_org_id);
CREATE INDEX idx_proceedings_appeal_id ON proceedings(appeal_id);
CREATE INDEX idx_proceedings_sp_id ON proceedings(service_provider_id);
CREATE INDEX idx_proceedings_assigned_to ON proceedings(assigned_to);
CREATE INDEX idx_events_proceeding_id ON events(proceeding_id);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_activity_logs_sp_id ON activity_logs(service_provider_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);

-- ─── HELPER FUNCTIONS ────────────────────────────────────────

-- Returns current user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

-- Returns current user's org_id
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT org_id FROM users WHERE id = auth.uid()
$$;

-- Returns current user's service_provider_id
-- For sp_admin/sp_staff/director: their own org_id
-- For client: their org's parent_sp_id
-- For platform roles AND guest_manager/guest_user: NULL — guests must NOT
-- match the unconditional "service_provider_id = get_my_sp_id()" branch
-- used throughout RLS below, or they'd get full SP-wide read access instead
-- of being scoped to only their assigned proceeding(s). (The app-level
-- SessionUser.service_provider_id in lib/user.ts is computed independently
-- in JS and does resolve for guest roles — that's fine, every consumer of
-- it falls back to `?? user.org_id` regardless.)
CREATE OR REPLACE FUNCTION get_my_sp_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN u.role IN ('sp_admin', 'sp_staff', 'director') THEN u.org_id
    WHEN u.role = 'client' THEN o.parent_sp_id
    ELSE NULL
  END
  FROM users u
  JOIN organizations o ON o.id = u.org_id
  WHERE u.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_sp_id() TO authenticated;

-- Used by appeals_select's guest_manager/guest_user branch. Must be
-- SECURITY DEFINER (bypasses RLS on proceedings) — appeals_select cannot
-- query proceedings directly since proceedings_select also queries appeals,
-- which would make the two policies mutually recursive.
-- proceedings.guest_ids uuid[] (see supabase/migrations/20260723_*.sql) is
-- the dedicated guest_manager/guest_user access-grant column — separate
-- from assigned_to_ids, which is staff assignment (sp_admin/sp_staff/director).
CREATE OR REPLACE FUNCTION is_guest_assigned_to_appeal(target_appeal_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM proceedings p
    WHERE p.appeal_id = target_appeal_id AND p.guest_ids @> ARRAY[auth.uid()]
  )
$$;
GRANT EXECUTE ON FUNCTION is_guest_assigned_to_appeal(uuid) TO authenticated;

-- Used by organizations_select's guest_manager/guest_user branch — lets
-- guests read the ONE client org tied to their assigned proceeding's
-- litigation (needed for the read-only litigation summary), without
-- querying organizations itself (avoids recursion).
CREATE OR REPLACE FUNCTION is_guest_client_org(target_org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM appeals a
    JOIN proceedings p ON p.appeal_id = a.id
    WHERE a.client_org_id = target_org_id AND p.guest_ids @> ARRAY[auth.uid()]
  )
$$;
GRANT EXECUTE ON FUNCTION is_guest_client_org(uuid) TO authenticated;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proceedings ENABLE ROW LEVEL SECURITY;
ALTER TABLE proceeding_client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Organizations: platform admins see all; SP users see their SP + their clients; clients see their org.
-- guest_manager/guest_user get only the client org tied to their assigned proceeding(s).
CREATE POLICY "organizations_select" ON organizations FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR id = get_my_org_id()
  OR id = get_my_sp_id()
  OR parent_sp_id = get_my_sp_id()
  OR (
    get_my_role() IN ('guest_manager', 'guest_user')
    AND is_guest_client_org(organizations.id)
  )
);
CREATE POLICY "organizations_insert" ON organizations FOR INSERT WITH CHECK (
  get_my_role() IN ('super_admin', 'platform_admin', 'sp_admin')
);
CREATE POLICY "organizations_update" ON organizations FOR UPDATE USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR (get_my_role() = 'sp_admin' AND id = get_my_sp_id())
);

-- Compliance details: scoped to org access
CREATE POLICY "compliance_select" ON compliance_details FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR org_id = get_my_org_id()
  OR org_id = get_my_sp_id()
  OR EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND parent_sp_id = get_my_sp_id())
);
CREATE POLICY "compliance_insert" ON compliance_details FOR INSERT WITH CHECK (
  get_my_role() IN ('super_admin', 'platform_admin', 'sp_admin')
);
CREATE POLICY "compliance_update" ON compliance_details FOR UPDATE USING (
  get_my_role() IN ('super_admin', 'platform_admin', 'sp_admin')
);

-- Users: platform sees all; SP users see users in their SP; clients see themselves
CREATE POLICY "users_select" ON users FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR id = auth.uid()
  OR org_id = get_my_sp_id()
  OR EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND parent_sp_id = get_my_sp_id())
);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  get_my_role() IN ('super_admin', 'platform_admin', 'sp_admin')
);
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR (get_my_role() = 'sp_admin' AND EXISTS (
    SELECT 1 FROM organizations WHERE id = org_id AND parent_sp_id = get_my_sp_id()
  ))
  OR id = auth.uid()
);

-- User org memberships
CREATE POLICY "memberships_select" ON user_org_memberships FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR service_provider_id = get_my_sp_id()
  OR user_id = auth.uid()
);
CREATE POLICY "memberships_insert" ON user_org_memberships FOR INSERT WITH CHECK (
  get_my_role() IN ('super_admin', 'platform_admin', 'sp_admin')
);

-- Master records: platform records visible to all; SP records scoped to that SP
CREATE POLICY "masters_select" ON master_records FOR SELECT USING (
  level = 'platform'
  OR get_my_role() IN ('super_admin', 'platform_admin')
  OR service_provider_id = get_my_sp_id()
);
CREATE POLICY "masters_insert" ON master_records FOR INSERT WITH CHECK (
  (level = 'platform' AND get_my_role() IN ('super_admin', 'platform_admin'))
  OR (level = 'service_provider' AND get_my_role() = 'sp_admin' AND service_provider_id = get_my_sp_id())
);
CREATE POLICY "masters_update" ON master_records FOR UPDATE USING (
  (level = 'platform' AND get_my_role() IN ('super_admin', 'platform_admin'))
  OR (level = 'service_provider' AND get_my_role() = 'sp_admin' AND service_provider_id = get_my_sp_id())
);
CREATE POLICY "masters_delete" ON master_records FOR DELETE USING (
  (level = 'platform' AND get_my_role() IN ('super_admin', 'platform_admin'))
  OR (level = 'service_provider' AND get_my_role() = 'sp_admin' AND service_provider_id = get_my_sp_id())
);

-- Appeals: scoped to SP; clients see their org's appeals; guest_manager/
-- guest_user see the parent litigation of any proceeding they're assigned to
-- (read-only litigation summary, not the appeal's other proceedings)
CREATE POLICY "appeals_select" ON appeals FOR SELECT USING (
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
CREATE POLICY "appeals_insert" ON appeals FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff')
  AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "appeals_update" ON appeals FOR UPDATE USING (
  get_my_role() IN ('sp_admin', 'sp_staff')
  AND service_provider_id = get_my_sp_id()
);

-- Proceedings: same SP scoping as appeals. guest_manager/guest_user are
-- narrower still — they only see proceedings where they personally appear
-- in guest_ids (never full SP-wide access like sp_admin/sp_staff/director,
-- and separate from assigned_to_ids, which is staff assignment).
-- proceedings.guest_ids uuid[] — see supabase/migrations/20260723_*.sql
CREATE POLICY "proceedings_select" ON proceedings FOR SELECT USING (
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
CREATE POLICY "proceedings_insert" ON proceedings FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "proceedings_update" ON proceedings FOR UPDATE USING (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);

-- Events: same SP scoping. guest_manager/guest_user reach follows whichever
-- proceeding(s) they're assigned to, same as proceedings_select.
CREATE POLICY "events_select" ON events FOR SELECT USING (
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
CREATE POLICY "events_insert" ON events FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "events_update" ON events FOR UPDATE USING (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);

-- Event attachments
CREATE POLICY "attachments_select" ON event_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE id = event_id AND service_provider_id = get_my_sp_id())
  OR get_my_role() IN ('super_admin', 'platform_admin')
);
CREATE POLICY "attachments_insert" ON event_attachments FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff')
);

-- Time entries and expenses: SP scoped
CREATE POLICY "time_entries_select" ON time_entries FOR SELECT USING (
  service_provider_id = get_my_sp_id() OR get_my_role() IN ('super_admin', 'platform_admin')
);
CREATE POLICY "time_entries_insert" ON time_entries FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);

CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (
  service_provider_id = get_my_sp_id() OR get_my_role() IN ('super_admin', 'platform_admin')
);
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);

-- Templates and forms: SP scoped
CREATE POLICY "templates_select" ON templates FOR SELECT USING (
  service_provider_id = get_my_sp_id() OR get_my_role() IN ('super_admin', 'platform_admin')
);
CREATE POLICY "templates_insert" ON templates FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "templates_update" ON templates FOR UPDATE USING (
  get_my_role() IN ('sp_admin') AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "templates_delete" ON templates FOR DELETE USING (
  get_my_role() IN ('sp_admin') AND service_provider_id = get_my_sp_id()
);

CREATE POLICY "forms_select" ON forms FOR SELECT USING (
  service_provider_id = get_my_sp_id() OR get_my_role() IN ('super_admin', 'platform_admin')
);
CREATE POLICY "forms_insert" ON forms FOR INSERT WITH CHECK (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "forms_update" ON forms FOR UPDATE USING (
  get_my_role() IN ('sp_admin', 'sp_staff') AND service_provider_id = get_my_sp_id()
);
CREATE POLICY "forms_delete" ON forms FOR DELETE USING (
  get_my_role() = 'sp_admin' AND service_provider_id = get_my_sp_id()
);

-- Activity logs: SP scoped, read-only for SP Admin
CREATE POLICY "logs_select" ON activity_logs FOR SELECT USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR (get_my_role() = 'sp_admin' AND service_provider_id = get_my_sp_id())
);
CREATE POLICY "logs_insert" ON activity_logs FOR INSERT WITH CHECK (true);

-- ─── SEED: Platform Organization ─────────────────────────────
INSERT INTO organizations (id, name, type, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'AppealDesk Platform', 'platform', true);

-- ─── SEED: Platform Master Records ───────────────────────────
INSERT INTO master_records (name, type, level, sort_order) VALUES
  ('Company', 'business_type', 'platform', 1),
  ('Trust', 'business_type', 'platform', 2),
  ('Partnership', 'business_type', 'platform', 3),
  ('LLP', 'business_type', 'platform', 4),
  ('Sole Proprietorship', 'business_type', 'platform', 5),
  ('OPC', 'business_type', 'platform', 6),
  ('Custom', 'business_type', 'platform', 7),
  ('CIT(A)', 'proceeding_type', 'platform', 1),
  ('ITAT', 'proceeding_type', 'platform', 2),
  ('High Court', 'proceeding_type', 'platform', 3),
  ('Supreme Court', 'proceeding_type', 'platform', 4),
  ('DRP', 'proceeding_type', 'platform', 5),
  ('Revision u/s 263', 'proceeding_type', 'platform', 6),
  ('Revision u/s 264', 'proceeding_type', 'platform', 7),
  ('Income Tax Act', 'act_regulation', 'platform', 1),
  ('Wealth Tax Act', 'act_regulation', 'platform', 2),
  ('Gift Tax Act', 'act_regulation', 'platform', 3),
  ('2024-25', 'assessment_year', 'platform', 1),
  ('2023-24', 'assessment_year', 'platform', 2),
  ('2022-23', 'assessment_year', 'platform', 3),
  ('2021-22', 'assessment_year', 'platform', 4),
  ('2020-21', 'assessment_year', 'platform', 5);
