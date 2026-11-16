-- הגדרה ראשונית למשתמשת ולמוסד

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS institution_type TEXT
    CHECK (institution_type IN ('schools', 'high-schools', 'kindergartens')),
  ADD COLUMN IF NOT EXISTS education_framework TEXT
    CHECK (education_framework IN ('regular', 'special'));

-- פרופילים וסיסמאות נגישים רק מנתיבי שרת עם service_role.
REVOKE ALL ON TABLE user_profiles FROM anon, authenticated;

-- פרטי מוסד ניתנים לקריאה בצד הלקוח לצורך תאימות, אך לא לכתיבה.
REVOKE INSERT, UPDATE, DELETE ON TABLE institutions FROM anon, authenticated;
GRANT SELECT ON TABLE institutions TO anon, authenticated;

-- CREATE OR REPLACE לא יכול לשנות את סוג ההחזרה — חייבים DROP קודם
DROP FUNCTION IF EXISTS matoah_get_auth_material(TEXT);

CREATE FUNCTION matoah_get_auth_material(p_email TEXT)
RETURNS TABLE (
  password_hash TEXT,
  id UUID,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  institution_id UUID,
  institution_code TEXT,
  terms_accepted_at TIMESTAMPTZ,
  setup_completed_at TIMESTAMPTZ,
  is_admin BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.password_hash,
    up.id,
    up.full_name,
    up.phone,
    up.email,
    up.institution_id,
    up.institution_code,
    up.terms_accepted_at,
    up.setup_completed_at,
    up.is_admin,
    up.created_at
  FROM user_profiles up
  WHERE lower(up.email) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION matoah_get_auth_material(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION matoah_get_auth_material(TEXT) TO service_role;
