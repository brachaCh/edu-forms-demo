-- הקשחת גישה ל-password_hash: anon/authenticated לא יכולים לקרוא את העמודה.
-- כתיבה (רישום/עדכון סיסמה) נשארת מותרת. אימות כניסה מתבצע בשרת עם service_role.
-- מוודאים שעמודות 003/004 קיימות (למקרה שהמיגרציות הקודמות לא הורצו).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS institution_code TEXT;

REVOKE ALL ON TABLE user_profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  full_name,
  phone,
  email,
  institution_id,
  institution_code,
  terms_accepted_at,
  is_admin,
  created_at
) ON TABLE user_profiles TO anon, authenticated;

GRANT INSERT (
  id,
  full_name,
  phone,
  email,
  institution_id,
  institution_code,
  terms_accepted_at,
  is_admin,
  password_hash
) ON TABLE user_profiles TO anon, authenticated;

GRANT UPDATE (
  full_name,
  phone,
  email,
  institution_id,
  institution_code,
  terms_accepted_at,
  is_admin,
  password_hash
) ON TABLE user_profiles TO anon, authenticated;

GRANT DELETE ON TABLE user_profiles TO anon, authenticated;

-- מדיניות RLS נשארת (matoah_anon_all) — ההגבלה היא ברמת עמודות.

-- פונקציית עזר לשרת בלבד (service_role) — מחזירה חומר אימות בלי לחשוף ל-anon
CREATE OR REPLACE FUNCTION matoah_get_auth_material(p_email TEXT)
RETURNS TABLE (
  password_hash TEXT,
  id UUID,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  institution_id UUID,
  institution_code TEXT,
  terms_accepted_at TIMESTAMPTZ,
  is_admin BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.password_hash,
    up.id,
    up.full_name,
    up.phone,
    up.email,
    up.institution_id,
    up.institution_code,
    up.terms_accepted_at,
    up.is_admin,
    up.created_at
  FROM user_profiles up
  WHERE lower(up.email) = lower(trim(p_email))
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION matoah_get_auth_material(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION matoah_get_auth_material(TEXT) TO service_role;
