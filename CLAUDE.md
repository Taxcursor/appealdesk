# AppealDesk — Engineer Reference (Claude Code Master Prompt)

## Product Overview

AppealDesk is a **multi-tenant SaaS** for Chartered Accountant (CA) firms to manage client tax litigations (Income Tax, GST, Customs, etc.). It replaces Excel-based tracking with a structured, role-gated web application.

**Two portals, one codebase:**

- **Platform Portal** (`/platform/*`) — AppealDesk operators manage CA firm tenants (Service Providers)
- **SP Portal** (`/*`) — CA firms manage their clients' litigations

**Tech Stack:**

- Frontend/Backend: Next.js 15+ (App Router, Server Components, Server Actions)
- Database/Auth/Storage: Supabase (PostgreSQL + RLS + Auth + Storage)
- Styling: Tailwind CSS v4 (utility classes only, no custom CSS)
- Hosting: Hostinger VPS (production), Supabase (database/auth/storage)
- Language: TypeScript (strict mode)

---

## Repository Structure

```bash

appealdesk/
├── app/
│   ├── layout.tsx                    # Root layout — Inter font, metadata from platform_settings
│   ├── login/                        # Login page + LoginForm client component
│   ├── auth/callback/route.ts        # OAuth + invite + password reset handler
│   ├── auth/setup-password/          # Post-invite password setup page
│   ├── api/favicon/route.ts          # Dynamic favicon from platform logo
│   ├── (platform)/                   # Platform admin portal (super_admin, platform_admin only)
│   │   ├── layout.tsx                # Role guard → redirect if not platform role
│   │   └── platform/
│   │       ├── dashboard/            # KPI overview (SP count, user count, litigation count)
│   │       ├── providers/            # SP (CA firm) CRUD + [id] detail
│   │       ├── users/                # All users across SPs; new-platform, new-sp
│   │       ├── admins/               # Platform admin CRUD
│   │       ├── masters/              # Platform-level master records (acts, FYs, AYs)
│   │       ├── documents/            # Cross-SP document view
│   │       ├── logs/                 # Audit log viewer
│   │       └── settings/             # Platform branding (name, logo, support email)
│   └── (sp)/                         # SP portal (sp_admin, sp_staff, client)
│       ├── layout.tsx                # Role guard → redirect if platform role
│       ├── dashboard/                # SP overview: appeal counts, deadlines, recent events
│       ├── litigations/              # Core: list, new, [id] detail with proceedings/events
│       ├── clients/                  # Client org CRUD + compliance details + [id]
│       ├── users/                    # SP team + client users; new-sp, new-client, [id]/edit
│       ├── documents/                # Document library: forms, templates, resources
│       ├── masters/                  # SP-level masters (inherits platform masters)
│       ├── logs/                     # SP-scoped audit log
│       └── settings/                 # SP branding, address, compliance
├── components/
│   ├── layout/Sidebar.tsx            # Shared sidebar — role-filtered nav, collapse, password change
│   ├── sp/                           # SP portal client components
│   │   ├── AppealsClient.tsx         # Litigation list with filters, pagination, export
│   │   ├── AppealDetailClient.tsx    # Appeal detail — proceedings, events, documents (2300+ lines)
│   │   ├── AppealForm.tsx            # Create/edit appeal form
│   │   ├── ClientsClient.tsx         # Client org list
│   │   ├── ClientForm.tsx            # Create/edit client org + compliance
│   │   ├── UsersClient.tsx           # Dual-tab: Team + Client users
│   │   ├── DocumentsClient.tsx       # Forms, templates, resources tabs
│   │   ├── LogsClient.tsx            # Audit log with exportLogs()
│   │   ├── SpSettingsClient.tsx      # SP settings form
│   │   └── SpMastersClient.tsx       # Master records management
│   └── platform/                     # Platform portal client components
│       ├── ProvidersClient.tsx        # SP list + management
│       ├── ProviderForm.tsx           # Create/edit SP
│       ├── PlatformUsersClient.tsx    # All users list
│       ├── PlatformSpUserForm.tsx     # Add SP admin user
│       ├── PlatformSettingsClient.tsx # Platform branding form
│       └── ...
├── lib/
│   ├── supabase/server.ts            # createClient() [anon+SSR] | createServiceClient() [service role]
│   ├── supabase/client.ts            # Browser Supabase client
│   ├── user.ts                       # getCurrentUser() — React cache(), derives service_provider_id
│   ├── types.ts                      # All TypeScript interfaces and union types
│   ├── constants.ts                  # PER_PAGE_OPTIONS, DEFAULT_PER_PAGE, INDIAN_STATES
│   ├── audit.ts                      # logAction() — fire-and-forget audit insert
│   └── reports/                      # Export generators: excel.ts, pdf.ts, docx.ts
├── supabase/
│   ├── schema.sql                    # Full DDL: tables, enums, RLS policies, helper functions
│   └── storage.sql                   # Storage buckets + policies
└── DATABASE_SCHEMA.md                # Human-readable schema reference
```

---

## Multi-Tenancy Model

```
AppealDesk Platform (operator)
  └── Service Provider / CA Firm (tenant)   organizations.type = 'service_provider'
        ├── SP Users: sp_admin, sp_staff
        └── Client Organizations             organizations.type = 'client'
                                             organizations.parent_sp_id = SP.id
              └── Client Users: client
```

**Tenant isolation** is enforced by `service_provider_id` on every SP-scoped table. All SP queries MUST include `.eq("service_provider_id", spId)`. Client users derive their SP via `organizations.parent_sp_id`.

---

## User Roles & Access

| Role | Portal | Key Permissions |
| ---- | ------ | --------------- |

| `super_admin` | Platform | Everything — including managing other super admins and platform settings |
| `platform_admin` | Platform | Manage SPs, users, masters, documents (cannot manage super admins) |
| `sp_admin` | SP | Full SP access: clients, users, litigations, masters, logs, trash, settings |
| `sp_staff` | SP | Create/edit litigations, view clients/users, upload docs. No delete. |
| `client` | SP | View-only: own org's litigations, proceedings, events. No creates. |

**`getCurrentUser()`** (`lib/user.ts`) — always call this first in Server Actions and pages. Returns `SessionUser` with:

- `role` — one of the 5 roles above
- `org_id` — direct org (SP org for SP users, client org for client users)
- `service_provider_id` — always the SP org ID (null for platform roles)
- `first_name`, `last_name`, `email`, `is_active`, `avatar_url`

---

## Database Schema — Key Tables

### Core Litigation Hierarchy

```
appeals
  ├── id, service_provider_id → organizations
  ├── client_org_id           → organizations (client type)
  ├── act_regulation_id       → master_records (type='act_regulation')
  ├── financial_year_id       → master_records (type='financial_year')
  ├── assessment_year_id      → master_records (type='assessment_year')
  ├── status                  text DEFAULT 'open'
  ├── created_by              → users
  └── created_at, updated_at, deleted_at

proceedings  (child of appeal)
  ├── id, appeal_id, service_provider_id
  ├── proceeding_type_id      → master_records (type='proceeding_type')
  ├── authority_type, authority_name, jurisdiction, jurisdiction_city
  ├── importance              ENUM: critical | high | medium | low
  ├── mode                    ENUM: online | offline
  ├── status                  DEFAULT 'open'
  ├── assigned_to_ids         uuid[]  ← SP staff assigned (array, GIN index)
  ├── client_staff_ids        uuid[]  ← client users assigned (array)
  ├── possible_outcome        ENUM: favourable | doubtful | unfavourable
  ├── initiated_on            date
  ├── to_be_completed_by      date
  └── created_at, updated_at, deleted_at

events  (child of proceeding)
  ├── id, proceeding_id, service_provider_id
  ├── event_type              'main' | 'sub'
  ├── parent_event_id         → events  (null for main events)
  ├── category                ENUM: notice_from_authority | show_cause_notice |
  │                                 personal_hearing_notice | virtual_hearing_notice |
  │                                 response_to_notice | adjournment_request |
  │                                 personal_hearing | virtual_hearing |
  │                                 personal_follow_up | assessment_order |
  │                                 notice_of_penalty | penalty_order |
  │                                 filing_of_appeal | others
  ├── event_date, event_notice_number, description
  ├── details                 jsonb DEFAULT '{}'  ← category-specific fields
  ├── status                  DEFAULT 'open'
  ├── created_by              → users
  └── created_at, updated_at, deleted_at
```

### Documents (Polymorphic — one table for all attachments)

```
documents
  ├── id, service_provider_id
  ├── entity_type             'appeal' | 'proceeding' | 'event'
  ├── entity_id               uuid  (no hard FK — polymorphic)
  ├── file_name, file_url, file_type, file_size
  ├── description, uploaded_by → users
  └── created_at, deleted_at

INDEX ON (entity_type, entity_id)
INDEX ON (service_provider_id)
```

Always query with BOTH `entity_type` AND `entity_id`.

### Identity & Lookup

```
organizations    — type: 'platform' | 'service_provider' | 'client'
                   parent_sp_id: null for SP orgs, SP.id for client orgs
users            — id = auth.users.id; role; org_id; is_active; deleted_at
master_records   — type: act_regulation | financial_year | assessment_year | proceeding_type
                   level: platform | service_provider
                   parent_id: self-ref for hierarchy
compliance_details — type: pan | aadhaar | tan | gst; one row per (org_id, type)
user_org_memberships — client user ↔ multiple orgs; (user_id, org_id) UNIQUE
proceeding_client_users — which client users can view a proceeding (composite PK)
```

### Supporting Tables

```
expenses         — Appeal costs (expense_type, amount, attachment_url)
time_entries     — Hours logged per appeal (team_member_id, hours)
forms            — Income Tax Rules library (rule_no, rule_heading, form_no, page_no)
form_files       — Attachments per form (CASCADE delete on form_id)
templates        — Reusable document templates per SP
resources        — Knowledge base per SP (act_id, section, rule, description)
resource_files   — Attachments per resource (CASCADE delete on resource_id)
audit_logs       — Immutable append-only log (no UPDATE/DELETE policies by design)
platform_settings — Single-row platform config (platform_name, logo_url, description)
```

### Hard Deletes — Critical Rule

**Always** hard-delete rows using `.delete()` — never use soft-delete. Deleted rows are immediately removed from the database and cannot be restored. Ensure cascade delete logic is configured on foreign keys so parent deletions properly remove child records.

---

## RLS Helper Functions (PostgreSQL SECURITY DEFINER)

```sql
get_my_role()    → user_role  -- role of auth.uid()
get_my_org_id()  → uuid       -- org_id of auth.uid()
get_my_sp_id()   → uuid       -- SP org ID (null for platform roles)
```

These power all RLS policies. Standard SP-table RLS pattern:

```sql
USING (
  get_my_role() IN ('super_admin', 'platform_admin')
  OR service_provider_id = get_my_sp_id()
  OR <client access via appeals chain>
)
```

---

## Supabase Client Rules

| Situation                           | Client to use                                        |
| ----------------------------------- | ---------------------------------------------------- |
| Server Component / page (read data) | `createClient()` — anon key, respects RLS            |
| Server Action (write data)          | `createServiceClient()` — service role, bypasses RLS |
| Client Component (browser)          | `createClient()` from `lib/supabase/client.ts`       |

**Never** use `createServiceClient()` in Server Components/pages — it bypasses RLS and exposes all tenants' data.

---

## Server Action Pattern (follow exactly)

```typescript
"use server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { logAction } from "@/lib/audit";

export async function doSomething(input: InputType) {
  // 1. Auth check — ALWAYS first
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // 2. Role check
  if (!["sp_admin", "sp_staff"].includes(user.role))
    throw new Error("Unauthorized");

  // 3. Service client (server enforces auth instead of RLS)
  const supabase = await createServiceClient();
  const spId = user.service_provider_id!;

  // 4. DB operation — always include service_provider_id
  const { data, error } = await supabase
    .from("appeals")
    .insert({ service_provider_id: spId, ...input })
    .select()
    .single();

  // 5. Handle errors — translate Postgres codes to user-friendly messages
  if (error) {
    if (error.code === "23505") throw new Error("Already exists.");
    throw new Error(error.message);
  }

  // 6. Audit log — fire-and-forget, never blocks main action
  await logAction(supabase, {
    actorId: user.id,
    spId,
    action: "create",
    entityType: "appeal",
    entityLabel: `Appeal for client`,
  });

  // 7. Clear Next.js cache
  revalidatePath("/litigations");
}
```

---

## List Page Filter Pattern

```typescript
// Parse comma-separated multi-value URL params
const parseMulti = (v: string | string[] | undefined) =>
  typeof v === "string" ? v.split(",").filter(Boolean) : [];

const filterClients = parseMulti(params.client);
const filterStatuses = parseMulti(params.status);
const page = parseInt(String(params.page ?? "1"));
const perPage = parseInt(String(params.per_page ?? "25"));
const from = (page - 1) * perPage;
const to = from + perPage - 1;

let query = supabase
  .from("appeals")
  .select("...", { count: "exact" })
  .eq("service_provider_id", spId);

if (filterClients.length) query = query.in("client_org_id", filterClients);
if (filterStatuses.length) query = query.in("status", filterStatuses);
query = query.order("created_at", { ascending: false }).range(from, to);

// Fetch data + filter options in parallel
const [{ data, count }, { data: clients }] = await Promise.all([
  query,
  filterOptionsQuery,
]);
```

---

## Storage Buckets

| Bucket             | Public | Max Size | Purpose                                  |
| ------------------ | ------ | -------- | ---------------------------------------- |
| `org-files`        | Yes    | 5 MB     | Logos, compliance docs, user attachments |
| `appeal-documents` | No     | 10 MB    | Legacy case documents                    |
| `templates`        | No     | 10 MB    | SP document templates                    |

Upload path conventions:

- SP/client logos: `logos/{timestamp}-{filename}`
- Platform logo: `platform/logo-{timestamp}-{filename}`
- User docs: `user-docs/{timestamp}-{filename}`
- Compliance: `compliance/{type}/{timestamp}-{filename}`
- Appeal docs: `appeal-docs/{appealId}/{timestamp}-{filename}`

---

## Design System

**Single source of truth: `app/globals.css`.** All brand colors are design tokens
declared in the `@theme` block; Tailwind v4 generates utilities from them
(`bg-primary`, `text-heading`, `border-border`, `ring-accent`, …).

**NEVER hardcode hex in components** — `bg-[#1E3A5F]` is banned. Always use the
token utility. To rebrand, change the hex once in `globals.css` and rebuild.

| Token utility suffix  | Purpose                               | Current hex |
| --------------------- | ------------------------------------- | ----------- |
| `primary`             | Sidebar, buttons                      | `#1E3A5F`   |
| `primary-dark`        | Primary hover                         | `#162D4A`   |
| `accent`              | Input borders, links, icons           | `#4A6FA5`   |
| `accent-light`        | Hover bg on light surfaces            | `#EEF2FF`   |
| `accent-faint`        | Event rows (appeal detail)            | `#F8FAFF`   |
| `accent-tint`         | Proceeding section bg                 | `#EBF1F9`   |
| `accent-tint-hover`   | Hover on tinted blue surfaces         | `#D8E3F5`   |
| `page`                | Page background, row hover            | `#F8F9FA`   |
| `surface`             | Cards, tables (or use `bg-white`)     | `#FFFFFF`   |
| `surface-hover`       | Neutral hover, tab strips             | `#F3F4F6`   |
| `stripe`              | Alternating table rows                | `#FAFAFA`   |
| `heading`             | Headings, table header text           | `#1A1A2E`   |
| `secondary`           | Body / data-cell text                 | `#6B7280`   |
| `muted`               | Placeholders, row numbers             | `#9CA3AF`   |
| `border`              | Default borders, row dividers         | `#E5E7EB`   |
| `border-strong`       | Emphasized borders                    | `#D1D5DB`   |
| `table-header`        | thead background                      | `#D1D9E6`   |
| `table-header-border` | thead bottom border                   | `#B0BDD0`   |
| `success`             | Success / Favourable / Low importance | `#16A34A`   |
| `warning`             | Warning / Doubtful / High importance  | `#D97706`   |
| `warning-light`       | Warning banner background             | `#FFFBEB`   |
| `danger`              | Danger / Unfavourable / Critical      | `#DC2626`   |
| `info`                | Info / Medium importance              | `#2563EB`   |

**Canonical component classes** (defined in `@layer components` in `globals.css`)
— use these or their exact utility recipes for new UI: `.btn-primary`,
`.btn-secondary`, `.input-std`, `.card-std`, `.table-std`, `.thead-row`,
`.th-std`, `.td-std`, `.td-rownum`.

**Standard input:**

```
w-full px-3 py-2 text-sm border-2 border-accent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary
```

**Primary button:**

```
px-5 py-2.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60
```

**Card / section wrapper:**

```
bg-white border border-border rounded-xl p-6 shadow-sm
```

**Non-CSS consumers** (PDF/Excel/DOCX exports, charts): import `BRAND` +
`hexToRgb`/`hexPlain` from `lib/theme.ts` — never re-declare hex values.
Keep `lib/theme.ts` in sync with `globals.css` when tokens change.

**Font:** Inter (Google Fonts, loaded in root layout). No other font used.

---

## Naming Conventions

| Thing            | Convention                   | Example                                  |
| ---------------- | ---------------------------- | ---------------------------------------- |
| Route folders    | kebab-case                   | `new-sp/`, `[id]/edit/`                  |
| Component files  | PascalCase                   | `AppealsClient.tsx`, `Sidebar.tsx`       |
| Server Actions   | camelCase verbs              | `createAppeal`, `updateProceedingStatus` |
| DB columns       | snake_case                   | `service_provider_id`, `deleted_at`      |
| TypeScript types | PascalCase                   | `SessionUser`, `ReportAppeal`            |
| Constants        | SCREAMING_SNAKE or camelCase | `DEFAULT_PER_PAGE`, `INDIAN_STATES`      |

---

## Critical Engineering Rules

1. **Always** include `.eq("service_provider_id", spId)` on SP-scoped queries
2. **Always** hard-delete rows with `.delete()` — never use soft-delete; deleted rows are permanent and unrecoverable
3. **Always** configure cascade delete on foreign keys to maintain referential integrity during deletions
4. **Never** use `createServiceClient()` in Server Components/pages — only in Server Actions
5. **Never** skip `getCurrentUser()` + role check in Server Actions
6. **Always** call `revalidatePath()` after mutations to clear Next.js cache
7. **Always** `await logAction()` after successful creates/updates/deletes
8. Use **dynamic `import()`** for heavy client-side libs (jspdf, xlsx, docx) — never static imports
9. `<body suppressHydrationWarning>` in root layout — do not remove; suppresses browser extension noise
10. Filter URL params are comma-separated strings — always parse with `parseMulti()`
11. `NEXT_PUBLIC_*` vars are baked in at **build time** — env changes require `npm run build`, not just PM2 restart

## Debugging & Verification Rules

- Always run a FULL production build (e.g. `npm run       build`) after code changes, not just lint + typecheck. Do not claim a fix works until the full build passes.

- Diagnose the real root cause empirically before applying speculative fixes; reproduce the issue first and avoid risky changes to production behavior until the cause is confirmed.

- The local setup is Windows + Next.js (TypeScript)  project. Use PowerShell for shell commands,watch for .next cache corruption (clear it when build errors like \_not-found appear), and note that ssr:false dynamic imports fail in Server Components

- When verifying image-loading or visual fixes, confirm the result actually works (load the page/inspect output) rather than assuming a prior edit resolved it.

- Before doing any git push or PR work, run `gh auth status` and confirm the active account has collaborator access to this repo. Report any auth problems before proceeding.

---

## Common Utilities

```typescript
import { getCurrentUser } from "@/lib/user";
import { logAction } from "@/lib/audit";
import {
  DEFAULT_PER_PAGE,
  PER_PAGE_OPTIONS,
  INDIAN_STATES,
} from "@/lib/constants";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/client"; // browser only
import type { SessionUser, Appeal, Proceeding } from "@/lib/types";
```

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  — Anon/publishable key (baked into JS bundle at build time)
SUPABASE_SERVICE_ROLE_KEY      — Secret service key (server-side only — never expose to browser)
NEXT_PUBLIC_SITE_URL           — App base URL (used in auth email redirect links)
```

---

## Production Deployment

- **Server:** Hostinger VPS at `/var/www/appealdesk`
- **Process manager:** PM2 (`pm2 list`, `pm2 logs`)
- **Deploy command:** `cd /var/www/appealdesk && git pull origin main && npm run build && pm2 restart appealdesk`
- **Env file:** `/var/www/appealdesk/.env.local`

After changing any `NEXT_PUBLIC_*` var, always run `npm run build`. PM2 restart alone is not enough.

---

## Supabase Project

- **Region:** ap-south-1 (Mumbai)
- **URL:** `https://ulctjnzadowpxcxpnwdz.supabase.co`
- **Auth:** Email/password. Invite flow via `verifyOtp`. Password reset via email link.
- **RLS:** Enabled on all public tables. Service role key bypasses RLS entirely.
- **Storage:** `org-files` bucket must exist before any file uploads work (run `supabase/storage.sql`).
- **Key DB functions:** `get_my_role()`, `get_my_org_id()`, `get_my_sp_id()` — power all RLS policies.
