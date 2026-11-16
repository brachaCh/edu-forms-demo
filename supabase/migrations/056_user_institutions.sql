-- TZ-17: תמיכה בריבוי מוסדות למשתמש
-- טבלת חברות user_institutions מקשרת משתמש לכמה מוסדות
-- אחרי הרצת המיגרציה, משתמש יכול להשתייך ליותר ממוסד אחד

-- טבלת חברות
CREATE TABLE IF NOT EXISTS user_institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, institution_id)
);

CREATE INDEX IF NOT EXISTS user_institutions_user_idx
  ON user_institutions (user_id);

CREATE INDEX IF NOT EXISTS user_institutions_institution_idx
  ON user_institutions (institution_id);

COMMENT ON TABLE user_institutions IS
  'User-to-institution memberships. A user may belong to multiple institutions (TZ-17).';

-- RLS: service_role only (מדיניות זהה ל-teacher_invitations / auth_sessions)
ALTER TABLE user_institutions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE user_institutions TO service_role;
REVOKE ALL ON TABLE user_institutions FROM anon, authenticated;

-- Backfill: העתקת קישורים קיימים מ-user_profiles.institution_id
-- רק משתמשים עם institution_id מוגדר
-- תפקיד = owner אם is_institution_owner = true, אחרת member
INSERT INTO user_institutions (user_id, institution_id, role, created_at)
SELECT
  up.id AS user_id,
  up.institution_id,
  CASE WHEN up.is_institution_owner THEN 'owner' ELSE 'member' END AS role,
  COALESCE(up.created_at, now()) AS created_at
FROM user_profiles up
WHERE up.institution_id IS NOT NULL
ON CONFLICT (user_id, institution_id) DO NOTHING;

-- הוספת עמודת מוסד פעיל לסשנים
-- כשהמשתמש מתחבר ויש לו כמה מוסדות, הוא בוחר את המוסד הפעיל
ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS active_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

-- פונקציה לבדיקת חברות במוסד
DROP FUNCTION IF EXISTS check_user_institution_membership(UUID, UUID);

CREATE FUNCTION check_user_institution_membership(
  p_user_id UUID,
  p_institution_id UUID
) RETURNS TABLE (
  is_member BOOLEAN,
  role TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TRUE AS is_member,
    ui.role
  FROM user_institutions ui
  WHERE ui.user_id = p_user_id
    AND ui.institution_id = p_institution_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION check_user_institution_membership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_user_institution_membership(UUID, UUID) TO service_role;

-- פונקציה לשליפת כל המוסדות של משתמש
DROP FUNCTION IF EXISTS get_user_institutions(UUID);

CREATE FUNCTION get_user_institutions(p_user_id UUID)
RETURNS TABLE (
  institution_id UUID,
  institution_code TEXT,
  institution_name TEXT,
  school_name TEXT,
  logo_url TEXT,
  role TEXT,
  membership_created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS institution_id,
    i.code AS institution_code,
    i.name AS institution_name,
    i.school_name,
    i.logo_url,
    ui.role,
    ui.created_at AS membership_created_at
  FROM user_institutions ui
  JOIN institutions i ON i.id = ui.institution_id
  WHERE ui.user_id = p_user_id
  ORDER BY ui.created_at ASC;
$$;

REVOKE ALL ON FUNCTION get_user_institutions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_institutions(UUID) TO service_role;

-- סכמת dev
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dev'
  ) THEN
    -- טבלת חברות בסכמת dev
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'dev' AND table_name = 'user_institutions'
    ) THEN
      CREATE TABLE dev.user_institutions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES dev.user_profiles(id) ON DELETE CASCADE,
        institution_id UUID NOT NULL REFERENCES dev.institutions(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, institution_id)
      );

      CREATE INDEX IF NOT EXISTS dev_user_institutions_user_idx
        ON dev.user_institutions (user_id);

      CREATE INDEX IF NOT EXISTS dev_user_institutions_institution_idx
        ON dev.user_institutions (institution_id);

      ALTER TABLE dev.user_institutions ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON TABLE dev.user_institutions TO service_role;
      REVOKE ALL ON TABLE dev.user_institutions FROM anon, authenticated;
    END IF;

    -- Backfill בסכמת dev
    INSERT INTO dev.user_institutions (user_id, institution_id, role, created_at)
    SELECT
      up.id AS user_id,
      up.institution_id,
      CASE WHEN up.is_institution_owner THEN 'owner' ELSE 'member' END AS role,
      COALESCE(up.created_at, now()) AS created_at
    FROM dev.user_profiles up
    WHERE up.institution_id IS NOT NULL
    ON CONFLICT (user_id, institution_id) DO NOTHING;

    -- עמודת מוסד פעיל לסשנים בסכמת dev
    ALTER TABLE dev.auth_sessions
      ADD COLUMN IF NOT EXISTS active_institution_id UUID REFERENCES dev.institutions(id) ON DELETE SET NULL;

    -- פונקציות בסכמת dev
    EXECUTE 'DROP FUNCTION IF EXISTS dev.check_user_institution_membership(UUID, UUID)';
    EXECUTE $fn$
      CREATE FUNCTION dev.check_user_institution_membership(
        p_user_id UUID,
        p_institution_id UUID
      ) RETURNS TABLE (
        is_member BOOLEAN,
        role TEXT
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = dev
      AS $body$
        SELECT
          TRUE AS is_member,
          ui.role
        FROM user_institutions ui
        WHERE ui.user_id = p_user_id
          AND ui.institution_id = p_institution_id
        LIMIT 1;
      $body$
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION dev.check_user_institution_membership(UUID, UUID) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.check_user_institution_membership(UUID, UUID) TO service_role';

    EXECUTE 'DROP FUNCTION IF EXISTS dev.get_user_institutions(UUID)';
    EXECUTE $fn$
      CREATE FUNCTION dev.get_user_institutions(p_user_id UUID)
      RETURNS TABLE (
        institution_id UUID,
        institution_code TEXT,
        institution_name TEXT,
        school_name TEXT,
        logo_url TEXT,
        role TEXT,
        membership_created_at TIMESTAMPTZ
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = dev
      AS $body$
        SELECT
          i.id AS institution_id,
          i.code AS institution_code,
          i.name AS institution_name,
          i.school_name,
          i.logo_url,
          ui.role,
          ui.created_at AS membership_created_at
        FROM user_institutions ui
        JOIN institutions i ON i.id = ui.institution_id
        WHERE ui.user_id = p_user_id
        ORDER BY ui.created_at ASC;
      $body$
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION dev.get_user_institutions(UUID) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.get_user_institutions(UUID) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
