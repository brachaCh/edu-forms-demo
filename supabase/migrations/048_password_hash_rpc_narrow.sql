-- צמצום משטח סיכון: RPC חדש שמחזיר password_hash בלבד (בלי שדות פרופיל).
-- האש בצד האפליקציה: bcryptjs (קידומת bcrypt:, rounds=12) + legacy pbkdf2:…
-- PBKDF2 המותאם אינו נתמך ב-pgcrypto → ההשוואה נשארת בשרת.
-- אימות בפועל כיום: OTP; /api/auth/login מחזיר OTP_REQUIRED.
-- לא מוחקים את matoah_get_auth_material — OTP/לקוחות קיימים עדיין עלולים להסתמך עליו
-- עד שהאפליקציה עוברת לטעינת פרופיל ישירה ב-service_role.

-- ========== public ==========
CREATE OR REPLACE FUNCTION matoah_get_password_hash(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.password_hash
  FROM user_profiles up
  WHERE lower(up.email) = lower(trim(p_email))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION matoah_get_password_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION matoah_get_password_hash(TEXT) TO service_role;

-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'dev' AND table_name = 'user_profiles'
     ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION dev.matoah_get_password_hash(p_email TEXT)
      RETURNS TEXT
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = dev, public
      AS $body$
        SELECT up.password_hash
        FROM dev.user_profiles up
        WHERE lower(up.email) = lower(trim(p_email))
        LIMIT 1;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_get_password_hash(TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_get_password_hash(TEXT) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
