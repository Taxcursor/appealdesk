-- Platform-level actions (e.g. creating a platform master record) have no
-- service_provider_id — they aren't scoped to any single SP. audit_logs
-- previously required service_provider_id NOT NULL, which made it impossible
-- to log these actions at all. Relax to nullable so platform-scoped audit
-- entries can be recorded (service_provider_id left null for them).
ALTER TABLE audit_logs ALTER COLUMN service_provider_id DROP NOT NULL;
