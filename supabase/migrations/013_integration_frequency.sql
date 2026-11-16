-- שכיחות שילוב: גבוהה / נמוכה

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS integration_frequency TEXT NULL
    CHECK (
      integration_frequency IS NULL
      OR integration_frequency IN ('high', 'low')
    );

CREATE INDEX IF NOT EXISTS idx_students_integration_frequency
  ON students(status, integration_frequency);
