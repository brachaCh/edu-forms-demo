-- סטטוס «נשמר» לטפסים שנשלחו להורים לחתימה (לא טיוטה)

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  WHERE con.conrelid = 'public.student_form_fills'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.student_form_fills DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.student_form_fills
  ADD CONSTRAINT student_form_fills_status_check
  CHECK (status IN ('draft', 'saved', 'completed'));

DO $$
DECLARE
  con_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    RETURN;
  END IF;

  IF to_regclass('dev.student_form_fills') IS NULL THEN
    RETURN;
  END IF;

  SELECT con.conname INTO con_name
  FROM pg_constraint con
  WHERE con.conrelid = 'dev.student_form_fills'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE dev.student_form_fills DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE dev.student_form_fills
    ADD CONSTRAINT student_form_fills_status_check
    CHECK (status IN ('draft', 'saved', 'completed'));
END $$;
