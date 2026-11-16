-- סגירת ai_fill_examples_store ל-anon/authenticated.
-- אימות האפליקציה עצמאי (לא Supabase Auth) — אין מדיניות auth.uid().
-- מצב יעד: RLS מופעל, בלי policy, גישה רק דרך service_role בשרת.
-- (TRUNCATE אינו כפוף ל-RLS → REVOKE ALL חובה.)
-- לא מוחקים דוגמאות קיימות כאן — ניקוי PII רק ידנית עם גיבוי מתועד.

-- ========== public ==========
ALTER TABLE IF EXISTS ai_fill_examples_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matoah_anon_all ON ai_fill_examples_store;
DROP POLICY IF EXISTS matoah_anon_select ON ai_fill_examples_store;
REVOKE ALL ON TABLE ai_fill_examples_store FROM anon, authenticated;
GRANT ALL ON TABLE ai_fill_examples_store TO service_role;

-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'dev' AND table_name = 'ai_fill_examples_store'
     ) THEN
    ALTER TABLE dev.ai_fill_examples_store ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS matoah_anon_all ON dev.ai_fill_examples_store;
    DROP POLICY IF EXISTS matoah_anon_select ON dev.ai_fill_examples_store;
    REVOKE ALL ON TABLE dev.ai_fill_examples_store FROM anon, authenticated;
    GRANT ALL ON TABLE dev.ai_fill_examples_store TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
