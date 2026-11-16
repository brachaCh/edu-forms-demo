-- Fail-closed function privileges for anon/authenticated.
-- 045 revoked table GRANTs only; EXECUTE on RPCs (and PUBLIC default) can remain.
-- App calls matoah_* RPCs via service_role only.

-- ========== public: revoke EXECUTE from client roles + PUBLIC ==========
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS sch,
      p.proname AS fn,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.sch,
      r.fn,
      r.args
    );
  END LOOP;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ========== dev schema (if present): same posture ==========
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    FOR r IN
      SELECT
        n.nspname AS sch,
        p.proname AS fn,
        pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'dev'
        AND p.prokind IN ('f', 'p')
    LOOP
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
        r.sch,
        r.fn,
        r.args
      );
    END LOOP;

    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dev TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA dev REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA dev REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT EXECUTE ON FUNCTIONS TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA dev GRANT EXECUTE ON FUNCTIONS TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
