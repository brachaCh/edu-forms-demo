-- Restore matoah_get_auth_material if a prior 048 dropped it.
-- public: production OTP used this RPC via service_role.
-- dev: local/demo (NEXT_PUBLIC_SUPABASE_SCHEMA=dev).

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
  setup_completed_at TIMESTAMPTZ,
  is_admin BOOLEAN,
  is_institution_owner BOOLEAN,
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
    up.is_institution_owner,
    up.created_at
  FROM user_profiles up
  WHERE lower(up.email) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION matoah_get_auth_material(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION matoah_get_auth_material(TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dev') THEN
    EXECUTE 'DROP FUNCTION IF EXISTS dev.matoah_get_auth_material(TEXT)';
    EXECUTE $fn$
      CREATE FUNCTION dev.matoah_get_auth_material(p_email TEXT)
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
        is_institution_owner BOOLEAN,
        created_at TIMESTAMPTZ
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = dev
      AS $body$
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
          up.is_institution_owner,
          up.created_at
        FROM user_profiles up
        WHERE lower(up.email) = lower(trim(p_email))
        LIMIT 1;
      $body$
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_get_auth_material(TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_get_auth_material(TEXT) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
