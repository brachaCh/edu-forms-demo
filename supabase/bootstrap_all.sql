-- ============================================================
-- Matoah bootstrap: schema migrations in correct order (001..017)
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ============================================================
-- >>> 001_matoah_schema.sql
-- ============================================================
-- מתוה — סכמת מסד נתונים ראשונית
-- הריצו ב-Supabase SQL Editor:
-- https://supabase.com/dashboard/project/demo-local/sql/new

-- מוסדות
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  school_name TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- פרופילי משתמשים (מקושר ל-auth.users כשיש התחברות)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  terms_accepted_at TIMESTAMPTZ,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- תלמידים
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('schools', 'high-schools', 'kindergartens', 'tutorials')),
  full_name TEXT NOT NULL,
  phone TEXT,
  father_name TEXT,
  mother_name TEXT,
  status TEXT CHECK (status IN ('integration', 'personal-basket', 'special-ed-class', 'integration-teacher')),
  class_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- מסמכי תלמיד
CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  data_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- שדות מותאמים אישית לתלמיד
CREATE TABLE IF NOT EXISTS student_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- מאגר שעות (שעון חול)
CREATE TABLE IF NOT EXISTS project_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  management_total NUMERIC NOT NULL DEFAULT 0 CHECK (management_total >= 0),
  management_used NUMERIC NOT NULL DEFAULT 0 CHECK (management_used >= 0),
  programming_total NUMERIC NOT NULL DEFAULT 0 CHECK (programming_total >= 0),
  programming_used NUMERIC NOT NULL DEFAULT 0 CHECK (programming_used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_hours_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool TEXT NOT NULL CHECK (pool IN ('management', 'programming')),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- אינדקסים
CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_custom_fields_student ON student_custom_fields(student_id);

-- עדכון updated_at אוטומטי
CREATE OR REPLACE FUNCTION matoah_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS students_updated_at ON students;
CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION matoah_set_updated_at();

DROP TRIGGER IF EXISTS student_custom_fields_updated_at ON student_custom_fields;
CREATE TRIGGER student_custom_fields_updated_at
  BEFORE UPDATE ON student_custom_fields
  FOR EACH ROW EXECUTE FUNCTION matoah_set_updated_at();

DROP TRIGGER IF EXISTS project_hours_updated_at ON project_hours;
CREATE TRIGGER project_hours_updated_at
  BEFORE UPDATE ON project_hours
  FOR EACH ROW EXECUTE FUNCTION matoah_set_updated_at();

-- RLS
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_hours_log ENABLE ROW LEVEL SECURITY;

-- מדיניות פתוחה לפיתוח (יש להקשיח ב-production)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'institutions', 'user_profiles', 'students',
    'student_documents', 'student_custom_fields',
    'project_hours', 'project_hours_log'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS matoah_anon_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY matoah_anon_all ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- שורת ברירת מחדל למאגר שעות
INSERT INTO project_hours (management_total, programming_total)
SELECT 0, 0
WHERE NOT EXISTS (SELECT 1 FROM project_hours);

-- מוסד ברירת מחדל
INSERT INTO institutions (code, name, school_name)
SELECT 'default', 'מוסד ברירת מחדל', 'מתוה'
WHERE NOT EXISTS (SELECT 1 FROM institutions WHERE code = 'default');


-- ============================================================
-- >>> 002_integrity_and_hours_rpc.sql
-- ============================================================
-- מתוה — תיקוני שלמות נתונים + עדכון שעות אטומי
-- הריצו ב-Supabase SQL Editor אחרי 001_matoah_schema.sql

-- =====================================================
-- 1. מניעת פרופילים כפולים לפי אימייל
-- =====================================================
-- הסרת כפילויות קיימות (משאיר את הרשומה הישנה ביותר לכל אימייל)
DELETE FROM user_profiles a
USING user_profiles b
WHERE a.email = b.email
  AND a.created_at > b.created_at;

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_email_key;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_email_key UNIQUE (email);

-- =====================================================
-- 2. אילוצי שלמות למאגר השעות (used <= total)
-- =====================================================
-- יישור נתונים חורגים לפני הוספת האילוץ
UPDATE project_hours
SET management_used = LEAST(management_used, management_total),
    programming_used = LEAST(programming_used, programming_total)
WHERE management_used > management_total
   OR programming_used > programming_total;

ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_total;
ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_management_used_lte_total
  CHECK (management_used <= management_total);

ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_total;
ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_programming_used_lte_total
  CHECK (programming_used <= programming_total);

-- =====================================================
-- 3. עדכון שעות אטומי (מונע race condition וניכוי-יתר)
-- =====================================================

-- ניכוי שעות: אטומי, נכשל אם אין מספיק יתרה, ורושם ליומן
CREATE OR REPLACE FUNCTION matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $$
DECLARE
  r project_hours;
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

-- החזרת שעות: אטומי, מוגבל למה שנוכה בפועל (ללא החזרת-יתר), ורושם ליומן
CREATE OR REPLACE FUNCTION matoah_add_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $$
DECLARE
  r project_hours;
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


-- ============================================================
-- >>> 003_user_password_hash.sql
-- ============================================================
-- סיסמת כניסה לפרופיל משתמש (hash בלבד)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;


-- ============================================================
-- >>> 004_user_institution_code.sql
-- ============================================================
-- קוד מוסד שהמשתמש הזין ברישום (לתצוגה באזור האישי)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS institution_code TEXT;


-- ============================================================
-- >>> 005_student_teacher_name.sql
-- ============================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS teacher_name TEXT;


-- ============================================================
-- >>> 006_site_texts.sql
-- ============================================================
-- כיתובי מערכת משותפים (סנכרון בין כל המשתמשים והסביבות)
CREATE TABLE IF NOT EXISTS site_text_overrides (
  id TEXT PRIMARY KEY DEFAULT 'global',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS site_text_overrides_updated_at ON site_text_overrides;
CREATE TRIGGER site_text_overrides_updated_at
  BEFORE UPDATE ON site_text_overrides
  FOR EACH ROW EXECUTE FUNCTION matoah_set_updated_at();

ALTER TABLE site_text_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matoah_anon_all ON site_text_overrides;
CREATE POLICY matoah_anon_all ON site_text_overrides
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ============================================================
-- >>> 007_auth_password_hardening.sql
-- ============================================================
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


-- ============================================================
-- >>> 008_document_folders.sql
-- ============================================================
-- תיקיות למסמכי תלמיד / איש צוות
ALTER TABLE student_documents
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'כללי';

CREATE INDEX IF NOT EXISTS idx_student_documents_folder
  ON student_documents(student_id, folder);


-- ============================================================
-- >>> 009_document_archive.sql
-- ============================================================
-- תיקיות + ארכיון למסמכי תלמיד
-- (folder נדרש לאינדקס; אם 008 לא רצה בפרודקשן — נוסיף כאן)

ALTER TABLE student_documents
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'כללי';

ALTER TABLE student_documents
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_student_documents_folder
  ON student_documents(student_id, folder);

CREATE INDEX IF NOT EXISTS idx_student_documents_archived
  ON student_documents(student_id, folder, archived_at);


-- ============================================================
-- >>> 010_email_rate_limits.sql
-- ============================================================
-- Rate limiting for public email Edge Functions (contact / bug-report)
create table if not exists public.email_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.email_rate_limits is
  'Sliding-window counters for contact/bug-report Edge Functions. Service-role only.';

alter table public.email_rate_limits enable row level security;

-- No policies for anon/authenticated — only service_role (bypasses RLS) may touch this table.


-- ============================================================
-- >>> 011_student_form_fills.sql
-- ============================================================
-- מילויי טפסים מובנים (מקור האמת לנתוני טופס)

CREATE TABLE IF NOT EXISTS student_form_fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'saved', 'completed')),
  document_id UUID NULL REFERENCES student_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_student_form_fills_student
  ON student_form_fills(student_id);

CREATE INDEX IF NOT EXISTS idx_student_form_fills_form
  ON student_form_fills(form_id);


-- ============================================================
-- >>> 012_calendar_year.sql
-- ============================================================
-- שנה קלנדרית לתלמיד ולמסמכים (לחלוקת ארכיון לפי שנים)

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS calendar_year INTEGER NULL;

ALTER TABLE student_documents
  ADD COLUMN IF NOT EXISTS calendar_year INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_students_calendar_year
  ON students(calendar_year);

CREATE INDEX IF NOT EXISTS idx_student_documents_calendar_year
  ON student_documents(student_id, calendar_year);


-- ============================================================
-- >>> 013_integration_frequency.sql
-- ============================================================
-- שכיחות שילוב: גבוהה / נמוכה

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS integration_frequency TEXT NULL
    CHECK (
      integration_frequency IS NULL
      OR integration_frequency IN ('high', 'low')
    );

CREATE INDEX IF NOT EXISTS idx_students_integration_frequency
  ON students(status, integration_frequency);


-- ============================================================
-- >>> 014_student_extra_fields.sql
-- ============================================================
-- שדות נוספים לכרטיס תלמיד:
-- ת.ז, ת. לידה, ז/נ, כתובת, ישוב, נייד אב, נייד אם, כתובת מייל

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS id_number     TEXT NULL,
  ADD COLUMN IF NOT EXISTS birth_date    DATE NULL,
  ADD COLUMN IF NOT EXISTS gender        TEXT NULL
    CHECK (gender IS NULL OR gender IN ('ז', 'נ')),
  ADD COLUMN IF NOT EXISTS home_address  TEXT NULL,
  ADD COLUMN IF NOT EXISTS city          TEXT NULL,
  ADD COLUMN IF NOT EXISTS father_mobile TEXT NULL,
  ADD COLUMN IF NOT EXISTS mother_mobile TEXT NULL,
  ADD COLUMN IF NOT EXISTS email         TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_students_id_number ON students(id_number);
CREATE INDEX IF NOT EXISTS idx_students_city      ON students(city);

-- ============================================================
-- >>> 016_staff_role.sql
-- ============================================================
-- תפקיד בכרטיס איש צוות

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS role TEXT NULL;

-- ============================================================
-- >>> 017_student_card_fields.sql
-- ============================================================
-- שדות כרטיס תלמיד שילוב / תלמיד כיתה (כולל מסגרות חינוך מיוחד):
-- אפיון, מצב משפחתי, תאריך כניסה לשילוב, תאריך וועדת אפיון וזכאות,
-- מחנכת, טיפולים נוספים

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS characterization            TEXT NULL,
  ADD COLUMN IF NOT EXISTS family_status               TEXT NULL
    CHECK (
      family_status IS NULL
      OR family_status IN ('נשואים', 'פרודים', 'גרושים')
    ),
  ADD COLUMN IF NOT EXISTS integration_start_date      DATE NULL,
  ADD COLUMN IF NOT EXISTS eligibility_committee_date  DATE NULL,
  ADD COLUMN IF NOT EXISTS homeroom_teacher            TEXT NULL,
  ADD COLUMN IF NOT EXISTS additional_treatments       TEXT NULL;

