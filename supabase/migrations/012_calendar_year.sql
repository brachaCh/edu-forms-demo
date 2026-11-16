-- שנה קלנדרית לתלמיד ולמסמכים (לחלוקת ארכיון לפי שנים)

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS calendar_year INTEGER NULL;

ALTER TABLE student_documents
  ADD COLUMN IF NOT EXISTS calendar_year INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_students_calendar_year
  ON students(calendar_year);

CREATE INDEX IF NOT EXISTS idx_student_documents_calendar_year
  ON student_documents(student_id, calendar_year);
