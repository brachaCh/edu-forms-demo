-- סגירת גישת anon/authenticated ליומן שעות הפרויקט (project_hours_log).
-- אימות האפליקציה הוא עצמאי (user_profiles.password_hash + auth_sessions /
-- matoah_get_auth_material ל-service_role) — לא Supabase Auth; לכן אין מדיניות
-- מבוססת auth.uid() (היה נועל הכל עם NULL).
-- מצב יעד: כמו students — RLS מופעל, בלי policy, גישה רק דרך service_role בשרת.
-- (TRUNCATE אינו כפוף ל-RLS; לכן גם REVOKE ברמת הטבלה הוא חובה.)
-- אידמפוטנטי: בטוח גם אם 039 כבר הריצה חלק מהשלבים.

-- ========== public ==========
ALTER TABLE IF EXISTS project_hours_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matoah_anon_all ON project_hours_log;
-- לא יוצרים מדיניות חלופית ל-anon/authenticated → deny-by-default

REVOKE ALL ON TABLE project_hours_log FROM anon, authenticated;
GRANT ALL ON TABLE project_hours_log TO service_role;
-- RPC-ים שכותבים ליומן: בלי EXECUTE ל-anon (קריאה רק משרת עם service_role)
REVOKE ALL ON FUNCTION matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION matoah_add_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION matoah_deduct_hours(TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION matoah_add_hours(TEXT, NUMERIC) TO service_role;
-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'dev' AND table_name = 'project_hours_log'
     ) THEN
    ALTER TABLE dev.project_hours_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS matoah_anon_all ON dev.project_hours_log;
    REVOKE ALL ON TABLE dev.project_hours_log FROM anon, authenticated;
    GRANT ALL ON TABLE dev.project_hours_log TO service_role;

    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'dev' AND p.proname = 'matoah_deduct_hours'
    ) THEN
      EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
      EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) TO service_role';
      EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) TO service_role';
    END IF;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
