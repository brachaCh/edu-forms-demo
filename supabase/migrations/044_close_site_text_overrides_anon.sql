-- סגירת site_text_overrides ל-anon/authenticated.
-- אימות האפליקציה עצמאי (user_profiles.password_hash + auth_sessions /
-- login_otp_codes / matoah_get_auth_material ל-service_role) — לא Supabase Auth;
-- לכן אין מדיניות מבוססת auth.uid() (היה מחזיר NULL ונועל הכל).
-- מצב יעד: כמו students — RLS מופעל, בלי policy, גישה רק דרך service_role בשרת.
-- (TRUNCATE אינו כפוף ל-RLS → REVOKE ALL חובה.)
-- אידמפוטנטי: בטוח גם אם 039 השאירה matoah_anon_select + GRANT SELECT.


-- ========== public ==========
ALTER TABLE IF EXISTS site_text_overrides ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS matoah_anon_all ON site_text_overrides;
DROP POLICY IF EXISTS matoah_anon_select ON site_text_overrides;

REVOKE ALL ON TABLE site_text_overrides FROM anon, authenticated;
GRANT ALL ON TABLE site_text_overrides TO service_role;

-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'dev' AND table_name = 'site_text_overrides'
     ) THEN
    ALTER TABLE dev.site_text_overrides ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS matoah_anon_all ON dev.site_text_overrides;
    DROP POLICY IF EXISTS matoah_anon_select ON dev.site_text_overrides;
    REVOKE ALL ON TABLE dev.site_text_overrides FROM anon, authenticated;
    GRANT ALL ON TABLE dev.site_text_overrides TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
