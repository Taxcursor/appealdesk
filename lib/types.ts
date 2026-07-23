// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "platform_admin"
  | "sp_admin"
  | "sp_staff"
  | "director"
  | "guest_manager"
  | "guest_user"
  | "client";

export type OrgType = "platform" | "service_provider" | "client";

export type BusinessType =
  | "Company"
  | "Trust"
  | "Partnership"
  | "LLP"
  | "Sole Proprietorship"
  | "OPC"
  | "Custom";

export type MasterRecordLevel = "platform" | "service_provider";

export type ComplianceType = "pan" | "aadhaar" | "tan" | "gst";

export type ImportanceLevel = "critical" | "high" | "medium" | "low";

export type PossibleOutcome = "favourable" | "doubtful" | "unfavourable";

export type ProceedingMode = "faceless" | "jurisdictional" | "both";

export type EventCategory =
  | "notice_from_authority"
  | "show_cause_notice"
  | "personal_hearing_notice"
  | "virtual_hearing_notice"
  | "response_to_notice"
  | "adjournment_request"
  | "personal_hearing"
  | "virtual_hearing"
  | "personal_follow_up"
  | "assessment_order"
  | "notice_of_penalty"
  | "penalty_order"
  | "filing_of_appeal"
  | "cit_a_order"
  | "itat_order"
  | "high_court_order"
  | "supreme_court_order"
  | "stay_petition"
  | "others";

export type NoticeStatus = "open" | "closed";

// ─── Organizations ────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  parent_sp_id?: string;
  business_type?: BusinessType;
  date_of_incorporation?: string;
  logo_url?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  pin_code?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplianceDetail {
  id: string;
  org_id: string;
  type: ComplianceType;
  number?: string;
  login_id?: string;
  attachment_url?: string;
  created_at: string;
  updated_at: string;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  mobile_country_code?: string;
  mobile_number?: string;
  date_of_birth?: string;
  profile_picture_url?: string;
  role: UserRole;
  org_id: string;
  department?: string;
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  pin_code?: string;
  pan_number?: string;
  pan_attachment_url?: string;
  aadhaar_number?: string;
  aadhaar_attachment_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  organization?: Organization;
}

export interface UserOrgMembership {
  id: string;
  user_id: string;
  org_id: string;
  service_provider_id: string;
  is_active: boolean;
  created_at: string;
}

// ─── Master Records ───────────────────────────────────────────────────────────

export interface MasterRecord {
  id: string;
  name: string;
  type: string;
  level: MasterRecordLevel;
  service_provider_id?: string;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Lightweight master item passed to form components */
export interface MasterItem {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
}

// ─── Appeals ─────────────────────────────────────────────────────────────────

export interface Appeal {
  id: string;
  service_provider_id: string;
  client_org_id: string;
  act_regulation?: string;
  assessment_year?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_org?: Pick<Organization, "id" | "name">;
  proceedings?: Proceeding[];
}

export interface Proceeding {
  id: string;
  appeal_id: string;
  service_provider_id: string;
  proceeding_type?: string;
  authority_type?: "assessing" | "appellate";
  authority_name?: string;
  jurisdiction?: string;
  jurisdiction_address?: string;
  jurisdiction_city?: string;
  importance?: ImportanceLevel;
  mode?: ProceedingMode;
  initiated_on?: string;
  to_be_completed_by?: string;
  assigned_to?: string;
  possible_outcome?: PossibleOutcome;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  assigned_user?: Pick<User, "id" | "first_name" | "last_name">;
  events?: Event[];
}

export interface Event {
  id: string;
  proceeding_id: string;
  service_provider_id: string;
  category: EventCategory;
  event_date?: string;
  description?: string;
  details: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments?: EventAttachment[];
}

export interface EventAttachment {
  id: string;
  event_id: string;
  file_url: string;
  file_name: string;
  file_size?: number;
  created_by: string;
  created_at: string;
}

// ─── Time Tracking & Expenses ─────────────────────────────────────────────────

export interface TimeEntry {
  id: string;
  appeal_id: string;
  service_provider_id: string;
  team_member_id: string;
  activity: string;
  date: string;
  from_time: string;
  to_time: string;
  duration_minutes: number;
  created_at: string;
  team_member?: Pick<User, "id" | "first_name" | "last_name">;
}

export interface Expense {
  id: string;
  appeal_id: string;
  service_provider_id: string;
  expense_type: string;
  amount: number;
  attachment_url?: string;
  created_at: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  service_provider_id: string;
  name: string;
  description?: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}

export interface Form {
  id: string;
  service_provider_id: string;
  rule_no?: string;
  rule_heading?: string;
  form_no?: string;
  page_no?: string;
  parallel_rule?: string;
  url?: string;
  sort_order: number;
  created_at: string;
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  service_provider_id?: string;
  user_id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  user?: Pick<User, "id" | "first_name" | "last_name">;
}

// ─── Session / Auth ───────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  org_id: string;
  org_type: OrgType;
  service_provider_id: string | null; // null for platform roles
  first_name: string;
  last_name: string;
  is_active: boolean;
  avatar_url?: string | null;
  must_change_password?: boolean;
}

// ─── Proceeding Demand Issues ─────────────────────────────────────────────────

export interface DemandIssue {
  id: string;
  proceeding_id: string;
  linked_event_id: string | null;
  notice_no: string;
  notice_date: string | null;
  description: string;
  tax_demanded: number;
  tax_acceptable: number;
  tax_dropped: number;
  tax_remarks: string | null;
  interest_demanded: number;
  interest_acceptable: number;
  interest_dropped: number;
  interest_remarks: string | null;
  penalty_demanded: number;
  penalty_acceptable: number;
  penalty_dropped: number;
  penalty_remarks: string | null;
  sort_order: number;
  created_at: string;
}

export type DemandIssueInput = Omit<DemandIssue, "id" | "proceeding_id" | "created_at">;
