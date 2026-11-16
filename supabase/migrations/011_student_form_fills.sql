-- מילויי טפסים מובנים (מקור האמת לנתוני טופס)

CREATE TABLE IF NOT EXISTS student_form_fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),
  document_id UUID NULL REFERENCES student_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_student_form_fills_student
  ON student_form_fills(student_id);

CREATE INDEX IF NOT EXISTS idx_student_form_fills_form
  ON student_form_fills(form_id);

ALTER TABLE student_form_fills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matoah_anon_all ON student_form_fills;
CREATE POLICY matoah_anon_all ON student_form_fills
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
