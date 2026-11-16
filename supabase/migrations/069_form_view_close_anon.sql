-- TZ-view: סגירת גישת anon/authenticated לטבלאות צפייה (גישה רק דרך service_role ב-API)

ALTER TABLE public.form_view_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_view_send_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.form_view_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.form_view_send_log FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.form_view_requests TO service_role;
GRANT ALL ON TABLE public.form_view_send_log TO service_role;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('form_view_requests', 'form_view_send_log')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    IF to_regclass('dev.form_view_requests') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE dev.form_view_requests ENABLE ROW LEVEL SECURITY';
      EXECUTE 'REVOKE ALL ON TABLE dev.form_view_requests FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT ALL ON TABLE dev.form_view_requests TO service_role';
    END IF;
    IF to_regclass('dev.form_view_send_log') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE dev.form_view_send_log ENABLE ROW LEVEL SECURITY';
      EXECUTE 'REVOKE ALL ON TABLE dev.form_view_send_log FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT ALL ON TABLE dev.form_view_send_log TO service_role';
    END IF;

    FOR pol IN
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'dev'
        AND tablename IN ('form_view_requests', 'form_view_send_log')
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        pol.policyname,
        pol.schemaname,
        pol.tablename
      );
    END LOOP;
  END IF;
END $$;
