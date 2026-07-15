-- Adds per-type remarks fields to proceeding_demand_issues, supporting the
-- Demand tab redesign (Grand Total Breakup pivot + a Remarks column per
-- Tax/Interest/Penalty row). Idempotent — safe to re-run.

ALTER TABLE proceeding_demand_issues ADD COLUMN IF NOT EXISTS tax_remarks      text;
ALTER TABLE proceeding_demand_issues ADD COLUMN IF NOT EXISTS interest_remarks text;
ALTER TABLE proceeding_demand_issues ADD COLUMN IF NOT EXISTS penalty_remarks  text;