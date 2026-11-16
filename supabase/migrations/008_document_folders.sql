-- תיקיות למסמכי תלמיד / איש צוות
ALTER TABLE student_documents
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'כללי';

CREATE INDEX IF NOT EXISTS idx_student_documents_folder
  ON student_documents(student_id, folder);
