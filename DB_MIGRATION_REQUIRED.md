# DB Migration Required

This file tracks schema/enum changes that are built in a separate branch (`db-changes`) and must NOT be merged to `main` until the corresponding Supabase DB migrations are applied.

---

## Pending Migrations

### 1. ProceedingMode enum — replace `online/offline` with `faceless/jurisdictional/both`

**Branch:** `db-changes`
**Commit:** `feat: update ProceedingMode to faceless/jurisdictional/both (pending DB migration)`

**What changed in code:**
- `lib/types.ts`: `ProceedingMode = "faceless" | "jurisdictional" | "both"`
- `components/sp/AppealForm.tsx`: Mode dropdown options updated
- `components/sp/AppealDetailClient.tsx`: Mode dropdown options updated
- `app/(sp)/litigations/actions.ts`: Type cast updated

**DB migration to run on Supabase before merging:**
```sql
-- Step 1: Add new enum values
ALTER TYPE proceeding_mode ADD VALUE IF NOT EXISTS 'faceless';
ALTER TYPE proceeding_mode ADD VALUE IF NOT EXISTS 'jurisdictional';
ALTER TYPE proceeding_mode ADD VALUE IF NOT EXISTS 'both';

-- Step 2: Migrate existing data (map old → new as appropriate)
UPDATE proceedings SET mode = 'jurisdictional' WHERE mode = 'offline';
UPDATE proceedings SET mode = 'faceless'        WHERE mode = 'online';

-- Step 3: Remove old enum values (requires recreating the type in Postgres)
-- Run AFTER verifying no rows still use 'online' or 'offline':
-- ALTER TYPE proceeding_mode RENAME TO proceeding_mode_old;
-- CREATE TYPE proceeding_mode AS ENUM ('faceless', 'jurisdictional', 'both');
-- ALTER TABLE proceedings ALTER COLUMN mode TYPE proceeding_mode USING mode::text::proceeding_mode;
-- DROP TYPE proceeding_mode_old;
```

**How to merge after migration:**
1. Run the SQL above on Supabase.
2. Verify no proceedings have `mode IN ('online', 'offline')`.
3. Merge `db-changes` into `main`.

---

## Completed Migrations

_None yet._
