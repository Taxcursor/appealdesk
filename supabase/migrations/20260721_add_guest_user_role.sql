-- New SP portal role: same scope as guest_manager (proceedings they're
-- assigned to via assigned_to_ids, plus read-only litigation summary) but
-- strictly view-only everywhere.
-- Must run as its own statement — Postgres forbids referencing a new enum
-- value in the same transaction it was added in.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'guest_user';
