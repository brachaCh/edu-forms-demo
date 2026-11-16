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
