-- Per-SP API credentials for third-party integrations (e.g. Whitebooks GST)
CREATE TABLE sp_api_settings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_provider_id       uuid NOT NULL UNIQUE REFERENCES organizations(id),
  whitebooks_client_id      text,
  whitebooks_client_secret  text,
  whitebooks_gst_username   text,
  whitebooks_email          text,
  whitebooks_base_url       text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

ALTER TABLE sp_api_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_own_api_settings" ON sp_api_settings
  FOR ALL USING (
    get_my_role() IN ('super_admin', 'platform_admin')
    OR service_provider_id = get_my_sp_id()
  );
