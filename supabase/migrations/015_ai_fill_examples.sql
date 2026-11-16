-- דוגמאות מילוי AI משותפות ברמת מוסד (סנכרון בין מורות)
CREATE TABLE IF NOT EXISTS ai_fill_examples_store (
  id TEXT PRIMARY KEY,
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ai_fill_examples_store_updated_at ON ai_fill_examples_store;
CREATE TRIGGER ai_fill_examples_store_updated_at
  BEFORE UPDATE ON ai_fill_examples_store
  FOR EACH ROW EXECUTE FUNCTION matoah_set_updated_at();

ALTER TABLE ai_fill_examples_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matoah_anon_all ON ai_fill_examples_store;
CREATE POLICY matoah_anon_all ON ai_fill_examples_store
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
