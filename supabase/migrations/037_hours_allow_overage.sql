-- שעות פרויקט — חריגה מעל המכסה מותרת.
--
-- עד כאן המסד אכף used <= total בכל מאגר, ופונקציית הניכוי סירבה לנכות
-- מעל המכסה ("אין מספיק שעות במאגר"). בפועל מותר לחרוג מהמכסה, והחריגה
-- צריכה להופיע בווידג'ט כהתראה אדומה במקום להיחסם.

-- ---------------------------------------------------------------------------
-- public
-- ---------------------------------------------------------------------------
ALTER TABLE project_hours DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_total;
ALTER TABLE project_hours DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_total;
ALTER TABLE project_hours DROP CONSTRAINT IF EXISTS project_hours_extra_used_lte_total;

CREATE OR REPLACE FUNCTION public.matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $function$
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

  -- ניכוי מעל המכסה מותר — ההפרש מוצג כחריגה
  IF p_pool = 'management' THEN
    UPDATE project_hours
      SET management_used = management_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  ELSIF p_pool = 'programming' THEN
    UPDATE project_hours
      SET programming_used = programming_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    UPDATE project_hours
      SET extra_used = extra_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, p_amount);
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION matoah_deduct_hours(TEXT, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------
-- dev — אותו מצב. אין שם מאגר extra, ולכן שני מאגרים בלבד.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dev'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE dev.project_hours DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_total';
  EXECUTE 'ALTER TABLE dev.project_hours DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_total';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'dev' AND p.proname = 'matoah_deduct_hours'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION dev.matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
    RETURNS dev.project_hours
    LANGUAGE plpgsql
    SET search_path TO 'dev'
    AS $body$
    DECLARE
      r dev.project_hours;
    BEGIN
      IF p_pool NOT IN ('management', 'programming') THEN
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
        UPDATE project_hours
          SET management_used = management_used + p_amount
          WHERE id = r.id
          RETURNING * INTO r;
      ELSE
        UPDATE project_hours
          SET programming_used = programming_used + p_amount
          WHERE id = r.id
          RETURNING * INTO r;
      END IF;

      INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, p_amount);
      RETURN r;
    END;
    $body$;
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) TO service_role';
END $$;
