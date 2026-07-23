-- New SP portal role: view/edit/delete only proceedings they're assigned to
-- (via proceedings.assigned_to_ids), plus a read-only litigation summary.
-- Must run as its own statement — Postgres forbids referencing a new enum
-- value in the same transaction it was added in.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'guest_manager';
