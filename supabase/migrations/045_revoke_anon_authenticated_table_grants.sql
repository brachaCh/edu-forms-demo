-- Fail-closed table privileges for anon/authenticated.
-- RLS does not apply to TRUNCATE; table GRANTs including TRUNCATE must be revoked.
-- App data paths for PII go through service_role (API / Edge Functions).
-- Rule for new PII tables: REVOKE ALL then explicit GRANT only if required.

-- ========== public: revoke everything from client roles ==========
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT quote_ident(schemaname) AS sch, quote_ident(tablename) AS tbl
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s.%s FROM anon, authenticated', r.sch, r.tbl);
  END LOOP;
END $$;

-- Log / audit tables: immutable for client roles (skip if table missing in this env)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log'
  ) THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE audit_log FROM anon, authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_hours_log'
  ) THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE project_hours_log FROM anon, authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_rate_limits'
  ) THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE email_rate_limits FROM anon, authenticated';
  END IF;
END $$;

-- Future tables: stop auto-GRANT to client roles (role that owns new objects)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- ========== dev schema (if present): same posture ==========
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    FOR r IN
      SELECT quote_ident(schemaname) AS sch, quote_ident(tablename) AS tbl
      FROM pg_tables
      WHERE schemaname = 'dev'
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s.%s FROM anon, authenticated', r.sch, r.tbl);
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'dev' AND table_name = 'audit_log'
    ) THEN
      EXECUTE 'REVOKE UPDATE, DELETE ON TABLE dev.audit_log FROM anon, authenticated';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'dev' AND table_name = 'project_hours_log'
    ) THEN
      EXECUTE 'REVOKE UPDATE, DELETE ON TABLE dev.project_hours_log FROM anon, authenticated';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'dev' AND table_name = 'email_rate_limits'
    ) THEN
      EXECUTE 'REVOKE UPDATE, DELETE ON TABLE dev.email_rate_limits FROM anon, authenticated';
    END IF;

    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA dev REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA dev REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
