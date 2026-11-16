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
