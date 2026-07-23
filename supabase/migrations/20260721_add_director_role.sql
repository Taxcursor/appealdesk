-- New SP portal role: full sp_admin-level access except Settings (read-only).
-- Must run as its own statement — Postgres forbids referencing a new enum
-- value in the same transaction it was added in.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'director';
