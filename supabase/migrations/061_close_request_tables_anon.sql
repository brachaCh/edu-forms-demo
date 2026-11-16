-- TZ-29: בקשות מילוי/חתימה נוצרות רק דרך API מאומת (service_role).
-- אין GRANT ל-anon/authenticated ואין מדיניות RLS שפותחת INSERT.
-- המילוי/חתימה הציבוריים נשארים דרך קישור חתום + OTP / webhook עם חתימה.

ALTER TABLE public.form_fill_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simplesign_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.form_fill_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.form_signature_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.simplesign_submissions FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.form_fill_requests TO service_role;
GRANT ALL ON TABLE public.form_signature_requests TO service_role;
GRANT ALL ON TABLE public.simplesign_submissions TO service_role;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'form_fill_requests',
        'form_signature_requests',
        'simplesign_submissions'
      )
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
    IF to_regclass('dev.form_fill_requests') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE dev.form_fill_requests ENABLE ROW LEVEL SECURITY';
      EXECUTE 'REVOKE ALL ON TABLE dev.form_fill_requests FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT ALL ON TABLE dev.form_fill_requests TO service_role';
    END IF;
    IF to_regclass('dev.form_signature_requests') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE dev.form_signature_requests ENABLE ROW LEVEL SECURITY';
      EXECUTE 'REVOKE ALL ON TABLE dev.form_signature_requests FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT ALL ON TABLE dev.form_signature_requests TO service_role';
    END IF;
    IF to_regclass('dev.simplesign_submissions') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE dev.simplesign_submissions ENABLE ROW LEVEL SECURITY';
      EXECUTE 'REVOKE ALL ON TABLE dev.simplesign_submissions FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT ALL ON TABLE dev.simplesign_submissions TO service_role';
    END IF;

    FOR pol IN
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'dev'
        AND tablename IN (
          'form_fill_requests',
          'form_signature_requests',
          'simplesign_submissions'
        )
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
