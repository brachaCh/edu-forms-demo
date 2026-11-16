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
