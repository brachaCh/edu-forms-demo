-- סגירת גישת anon/authenticated לטבלת user_profiles.
-- אימות האפליקציה עצמאי (user_profiles.password_hash + auth_sessions /
-- login_otp_codes / password_reset_tokens / matoah_get_auth_material ל-service_role)
-- — לא Supabase Auth; לכן אין מדיניות מבוססת auth.uid() (היה מחזיר NULL ונועל הכל).
-- מצב יעד: כמו students — RLS מופעל, בלי policy, גישה רק דרך service_role
-- בנתיבי API שרת (register, otp, session, reset-password, teacher-invite).
-- (TRUNCATE אינו כפוף ל-RLS → REVOKE ALL חובה. הטבלה מכילה PII + password_hash.)
-- אידמפוטנטי: בטוח גם אם 007/039 כבר הריצו REVOKE חלקי.

-- ========== public ==========
ALTER TABLE IF EXISTS user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matoah_anon_all ON user_profiles;
-- לא יוצרים מדיניות חלופית ל-anon/authenticated → deny-by-default

REVOKE ALL ON TABLE user_profiles FROM anon, authenticated;
GRANT ALL ON TABLE user_profiles TO service_role;
-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'dev' AND table_name = 'user_profiles'
     ) THEN
    ALTER TABLE dev.user_profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS matoah_anon_all ON dev.user_profiles;
    REVOKE ALL ON TABLE dev.user_profiles FROM anon, authenticated;
    GRANT ALL ON TABLE dev.user_profiles TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
