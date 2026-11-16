-- כיתובי מערכת משותפים (סנכרון בין כל המשתמשים והסביבות)
CREATE TABLE IF NOT EXISTS site_text_overrides (
  id TEXT PRIMARY KEY DEFAULT 'global',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS site_text_overrides_updated_at ON site_text_overrides;
CREATE TRIGGER site_text_overrides_updated_at
  BEFORE UPDATE ON site_text_overrides
  FOR EACH ROW EXECUTE FUNCTION matoah_set_updated_at();

ALTER TABLE site_text_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matoah_anon_all ON site_text_overrides;
CREATE POLICY matoah_anon_all ON site_text_overrides
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
