-- מאגר שלישי: שעות נוספות (בנפרד מניהול ותכנות)

ALTER TABLE project_hours
  ADD COLUMN IF NOT EXISTS extra_total NUMERIC NOT NULL DEFAULT 0 CHECK (extra_total >= 0),
  ADD COLUMN IF NOT EXISTS extra_used NUMERIC NOT NULL DEFAULT 0 CHECK (extra_used >= 0);

-- מיגרציה מסכימה קודמת (אם הורצה בטעות עם management_extra / programming_extra)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_hours'
      AND column_name = 'management_extra'
  ) THEN
    UPDATE project_hours
    SET extra_total = COALESCE(management_extra, 0) + COALESCE(programming_extra, 0);

    ALTER TABLE project_hours DROP COLUMN management_extra;
    ALTER TABLE project_hours DROP COLUMN programming_extra;
  END IF;
END $$;

ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_cap;
ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_cap;
ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_total;
ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_total;
ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_extra_used_lte_total;

ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_management_used_lte_total
  CHECK (management_used <= management_total);

ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_programming_used_lte_total
  CHECK (programming_used <= programming_total);

ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_extra_used_lte_total
  CHECK (extra_used <= extra_total);

ALTER TABLE project_hours_log
  DROP CONSTRAINT IF EXISTS project_hours_log_pool_check;

ALTER TABLE project_hours_log
  ADD CONSTRAINT project_hours_log_pool_check
  CHECK (pool IN ('management', 'programming', 'extra'));

CREATE OR REPLACE FUNCTION matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $$
DECLARE
  r project_hours;
BEGIN
  IF p_pool NOT IN ('management', 'programming', 'extra') THEN
    RAISE EXCEPTION 'מאגר שעות לא תקין';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'כמות השעות חייבת להיות מספר חיובי';
  END IF;

  SELECT * INTO r FROM project_hours ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'מאגר השעות לא הוגדר';
  END IF;

  IF p_pool = 'management' THEN
    IF r.management_used + p_amount > r.management_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET management_used = management_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  ELSIF p_pool = 'programming' THEN
    IF r.programming_used + p_amount > r.programming_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET programming_used = programming_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    IF r.extra_used + p_amount > r.extra_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET extra_used = extra_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, p_amount);
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION matoah_add_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $$
DECLARE
  r project_hours;
  applied NUMERIC;
BEGIN
  IF p_pool NOT IN ('management', 'programming', 'extra') THEN
    RAISE EXCEPTION 'מאגר שעות לא תקין';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'כמות השעות חייבת להיות מספר חיובי';
  END IF;

  SELECT * INTO r FROM project_hours ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'מאגר השעות לא הוגדר';
  END IF;

  IF p_pool = 'management' THEN
    applied := LEAST(p_amount, r.management_used);
    UPDATE project_hours
      SET management_used = management_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  ELSIF p_pool = 'programming' THEN
    applied := LEAST(p_amount, r.programming_used);
    UPDATE project_hours
      SET programming_used = programming_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    applied := LEAST(p_amount, r.extra_used);
    UPDATE project_hours
      SET extra_used = extra_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  IF applied > 0 THEN
    INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, -applied);
  END IF;
  RETURN r;
END;
$$;
