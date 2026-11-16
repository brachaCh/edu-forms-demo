-- מאפשר מספר מופעים של אותו טופס (בשלב זה משמש להוספת תח"י נוסף).

ALTER TABLE student_form_fills
  DROP CONSTRAINT IF EXISTS student_form_fills_student_id_form_id_key;

CREATE INDEX IF NOT EXISTS idx_student_form_fills_student_form_updated
  ON student_form_fills(student_id, form_id, updated_at DESC);
