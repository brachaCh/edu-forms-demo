-- הפרדת סביבות: סכמת dev (נתוני דמה) ליד public (prod).
-- public לא משתנה. אחרי ההרצה: Dashboard → Settings → API → Exposed schemas → הוסיפו `dev`.

CREATE SCHEMA IF NOT EXISTS dev;

-- ---------------------------------------------------------------------------
-- מבנה טבלאות (LIKE כולל defaults / checks / indexes / PK — בלי FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dev.institutions (
  LIKE public.institutions INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.user_profiles (
  LIKE public.user_profiles INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.students (
  LIKE public.students INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.student_documents (
  LIKE public.student_documents INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.student_custom_fields (
  LIKE public.student_custom_fields INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.student_form_fills (
  LIKE public.student_form_fills INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.project_hours (
  LIKE public.project_hours INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.project_hours_log (
  LIKE public.project_hours_log INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.site_text_overrides (
  LIKE public.site_text_overrides INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.ai_fill_examples_store (
  LIKE public.ai_fill_examples_store INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.form_signature_requests (
  LIKE public.form_signature_requests INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.form_fill_requests (
  LIKE public.form_fill_requests INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS dev.password_reset_tokens (
  LIKE public.password_reset_tokens INCLUDING ALL
);

-- ---------------------------------------------------------------------------
-- Foreign keys בתוך סכמת dev בלבד
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_institution_id_fkey' AND conrelid = 'dev.user_profiles'::regclass
  ) THEN
    ALTER TABLE dev.user_profiles
      ADD CONSTRAINT user_profiles_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES dev.institutions(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_institution_id_fkey' AND conrelid = 'dev.students'::regclass
  ) THEN
    ALTER TABLE dev.students
      ADD CONSTRAINT students_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES dev.institutions(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_documents_student_id_fkey' AND conrelid = 'dev.student_documents'::regclass
  ) THEN
    ALTER TABLE dev.student_documents
      ADD CONSTRAINT student_documents_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES dev.students(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_custom_fields_student_id_fkey' AND conrelid = 'dev.student_custom_fields'::regclass
  ) THEN
    ALTER TABLE dev.student_custom_fields
      ADD CONSTRAINT student_custom_fields_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES dev.students(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_form_fills_student_id_fkey' AND conrelid = 'dev.student_form_fills'::regclass
  ) THEN
    ALTER TABLE dev.student_form_fills
      ADD CONSTRAINT student_form_fills_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES dev.students(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_form_fills_document_id_fkey' AND conrelid = 'dev.student_form_fills'::regclass
  ) THEN
    ALTER TABLE dev.student_form_fills
      ADD CONSTRAINT student_form_fills_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES dev.student_documents(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_signature_requests_form_fill_id_fkey'
      AND conrelid = 'dev.form_signature_requests'::regclass
  ) THEN
    ALTER TABLE dev.form_signature_requests
      ADD CONSTRAINT form_signature_requests_form_fill_id_fkey
      FOREIGN KEY (form_fill_id) REFERENCES dev.student_form_fills(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_fill_requests_form_fill_id_fkey'
      AND conrelid = 'dev.form_fill_requests'::regclass
  ) THEN
    ALTER TABLE dev.form_fill_requests
      ADD CONSTRAINT form_fill_requests_form_fill_id_fkey
      FOREIGN KEY (form_fill_id) REFERENCES dev.student_form_fills(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'password_reset_tokens_user_id_fkey'
      AND conrelid = 'dev.password_reset_tokens'::regclass
  ) THEN
    ALTER TABLE dev.password_reset_tokens
      ADD CONSTRAINT password_reset_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES dev.user_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Triggers (updated_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dev.matoah_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_updated_at ON dev.students;
CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON dev.students
  FOR EACH ROW EXECUTE FUNCTION dev.matoah_set_updated_at();

DROP TRIGGER IF EXISTS student_custom_fields_updated_at ON dev.student_custom_fields;
CREATE TRIGGER student_custom_fields_updated_at
  BEFORE UPDATE ON dev.student_custom_fields
  FOR EACH ROW EXECUTE FUNCTION dev.matoah_set_updated_at();

DROP TRIGGER IF EXISTS project_hours_updated_at ON dev.project_hours;
CREATE TRIGGER project_hours_updated_at
  BEFORE UPDATE ON dev.project_hours
  FOR EACH ROW EXECUTE FUNCTION dev.matoah_set_updated_at();

DROP TRIGGER IF EXISTS student_form_fills_updated_at ON dev.student_form_fills;
CREATE TRIGGER student_form_fills_updated_at
  BEFORE UPDATE ON dev.student_form_fills
  FOR EACH ROW EXECUTE FUNCTION dev.matoah_set_updated_at();

DROP TRIGGER IF EXISTS site_text_overrides_updated_at ON dev.site_text_overrides;
CREATE TRIGGER site_text_overrides_updated_at
  BEFORE UPDATE ON dev.site_text_overrides
  FOR EACH ROW EXECUTE FUNCTION dev.matoah_set_updated_at();

DROP TRIGGER IF EXISTS ai_fill_examples_store_updated_at ON dev.ai_fill_examples_store;
CREATE TRIGGER ai_fill_examples_store_updated_at
  BEFORE UPDATE ON dev.ai_fill_examples_store
  FOR EACH ROW EXECUTE FUNCTION dev.matoah_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — שיקוף מדיניות public (תלמידים: deny-by-default ל-anon)
-- ---------------------------------------------------------------------------
ALTER TABLE dev.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.student_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.student_form_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.project_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.project_hours_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.site_text_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.ai_fill_examples_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.form_signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.form_fill_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matoah_anon_all ON dev.institutions;
CREATE POLICY matoah_anon_all ON dev.institutions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS matoah_anon_all ON dev.project_hours;
CREATE POLICY matoah_anon_all ON dev.project_hours
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS matoah_anon_all ON dev.project_hours_log;
CREATE POLICY matoah_anon_all ON dev.project_hours_log
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS matoah_anon_all ON dev.site_text_overrides;
CREATE POLICY matoah_anon_all ON dev.site_text_overrides
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS matoah_anon_all ON dev.ai_fill_examples_store;
CREATE POLICY matoah_anon_all ON dev.ai_fill_examples_store
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- students / docs / custom / fills: RLS ללא policy ל-anon (גישה דרך service_role)
DROP POLICY IF EXISTS matoah_anon_all ON dev.students;
DROP POLICY IF EXISTS matoah_anon_all ON dev.student_documents;
DROP POLICY IF EXISTS matoah_anon_all ON dev.student_custom_fields;
DROP POLICY IF EXISTS matoah_anon_all ON dev.student_form_fills;

-- ---------------------------------------------------------------------------
-- Grants (כמו public אחרי 021)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA dev TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA dev TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dev TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dev TO service_role;

REVOKE ALL ON TABLE dev.user_profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE dev.institutions FROM anon, authenticated;
GRANT SELECT ON TABLE dev.institutions TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dev.project_hours TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dev.project_hours_log TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dev.site_text_overrides TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dev.ai_fill_examples_store TO anon, authenticated;

REVOKE ALL ON TABLE dev.password_reset_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE dev.form_signature_requests FROM anon, authenticated;
REVOKE ALL ON TABLE dev.form_fill_requests FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA dev
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dev
  GRANT ALL ON SEQUENCES TO service_role;

-- ---------------------------------------------------------------------------
-- RPC בסכמת dev (search_path = dev)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dev.matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS dev.project_hours
LANGUAGE plpgsql
SET search_path = dev
AS $$
DECLARE
  r dev.project_hours;
BEGIN
  IF p_pool NOT IN ('management', 'programming') THEN
    RAISE EXCEPTION 'מאגר שעות לא תקין';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'כמות השעות חייבת להיות מספר חיובי';
  END IF;

  SELECT * INTO r FROM project_hours ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'מאגר השעות לא הוגדר';
  END IF;

  IF p_pool = 'management' THEN
    IF r.management_used + p_amount > r.management_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET management_used = management_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    IF r.programming_used + p_amount > r.programming_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET programming_used = programming_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, p_amount);
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION dev.matoah_add_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS dev.project_hours
LANGUAGE plpgsql
SET search_path = dev
AS $$
DECLARE
  r dev.project_hours;
  applied NUMERIC;
BEGIN
  IF p_pool NOT IN ('management', 'programming') THEN
    RAISE EXCEPTION 'מאגר שעות לא תקין';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'כמות השעות חייבת להיות מספר חיובי';
  END IF;

  SELECT * INTO r FROM project_hours ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'מאגר השעות לא הוגדר';
  END IF;

  IF p_pool = 'management' THEN
    applied := LEAST(p_amount, r.management_used);
    UPDATE project_hours
      SET management_used = management_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    applied := LEAST(p_amount, r.programming_used);
    UPDATE project_hours
      SET programming_used = programming_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  IF applied > 0 THEN
    INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, -applied);
  END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION dev.matoah_get_auth_material(p_email TEXT)
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
SET search_path = dev
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

REVOKE ALL ON FUNCTION dev.matoah_get_auth_material(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dev.matoah_get_auth_material(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed דמה (idempotent)
-- סיסמת משתמשת: 
-- ---------------------------------------------------------------------------
INSERT INTO dev.institutions (
  id, code, name, school_name, logo_url, institution_type, education_framework
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'demo',
  'מוסד דמה',
  'בית ספר לדוגמה',
  NULL,
  'schools',
  'regular'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO dev.user_profiles (
  id,
  full_name,
  phone,
  email,
  institution_id,
  institution_code,
  terms_accepted_at,
  setup_completed_at,
  is_admin,
  password_hash
) VALUES (
  '00000000-0000-4000-8000-000000000002',
  'מורת דמה',
  '0500000000',
  'demo@matoah.dev',
  '00000000-0000-4000-8000-000000000001',
  'demo',
  now(),
  now(),
  true,
  'pbkdf2:100000:jnjLva4EySt6jwqg5beA7Q==:/QkketZaV9LXmvz59/bAK1dpCbPyO84CLxEbI0PBXa4='
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO dev.students (
  id, institution_id, category, full_name, phone, father_name, mother_name,
  status, class_name, notes, calendar_year, city, gender
) VALUES
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    'schools', 'נועה כהן', '0501111111', 'יוסי', 'רחל',
    'integration', 'ג׳1', 'תלמידת דמה — שילוב', 5786, 'תל אביב', 'נ'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000001',
    'schools', 'אורי לוי', '0502222222', 'דני', 'מיכל',
    'personal-basket', 'ד׳2', 'תלמיד דמה — סל אישי', 5786, 'רמת גן', 'ז'
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000001',
    'schools', 'מאיה אברהם', '0503333333', 'אבי', 'שרה',
    'special-ed-class', 'ה׳3', 'תלמידת דמה — כיתה', 5786, 'חולון', 'נ'
  ),
  (
    '00000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000001',
    'schools', 'יואב מזרחי', NULL, NULL, NULL,
    'integration-teacher', NULL, 'איש צוות דמה', 5786, NULL, 'ז'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO dev.project_hours (
  id, management_total, management_used, programming_total, programming_used
) VALUES (
  '00000000-0000-4000-8000-000000000090',
  100, 12, 80, 5
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dev.site_text_overrides (id, data)
VALUES ('global', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ניסיון לחשוף את הסכמה ל-PostgREST (ב-hosted לעיתים נדרש גם ב-Dashboard)
DO $$
BEGIN
  BEGIN
    EXECUTE $cmd$
      ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, storage, graphql_public, dev'
    $cmd$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not set pgrst.db_schemas on authenticator: %', SQLERRM;
  END;
END $$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
