-- סגירת גישת anon/authenticated לטבלת institutions.
-- אימות האפליקציה עצמאי (user_profiles.password_hash + auth_sessions /
-- login_otp_codes / password_reset_tokens / matoah_get_auth_material ל-service_role)
-- — לא Supabase Auth; לכן אין מדיניות מבוססת auth.uid() (היה מחזיר NULL ונועל הכל).
-- מצב יעד: כמו students — RLS מופעל, בלי policy, גישה רק דרך service_role
-- בנתיבי API שרת (register, session, billing, settings/institution, tenant/data).
-- (TRUNCATE אינו כפוף ל-RLS → REVOKE ALL חובה; גם SELECT נשלל — שדות מסחריים
-- כגון sumit_customer_id / plan_expires_at לא ייחשפו דרך REST עם anon key.)
-- אידמפוטנטי: בטוח גם אם 039 כבר הריצה DROP POLICY / REVOKE חלקי.

-- ========== public ==========
ALTER TABLE IF EXISTS institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matoah_anon_all ON institutions;
-- לא יוצרים מדיניות חלופית ל-anon/authenticated → deny-by-default

REVOKE ALL ON TABLE institutions FROM anon, authenticated;
GRANT ALL ON TABLE institutions TO service_role;
-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'dev' AND table_name = 'institutions'
     ) THEN
    ALTER TABLE dev.institutions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS matoah_anon_all ON dev.institutions;
    REVOKE ALL ON TABLE dev.institutions FROM anon, authenticated;
    GRANT ALL ON TABLE dev.institutions TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
