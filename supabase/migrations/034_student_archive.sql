-- ארכיון תיק תלמיד שלם (סיום ביה״ס וכו')

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_students_archived
  ON students(institution_id, archived_at);

ALTER TABLE IF EXISTS dev.students
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dev' AND table_name = 'students'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_dev_students_archived
      ON dev.students(institution_id, archived_at);
  END IF;
END $$;
