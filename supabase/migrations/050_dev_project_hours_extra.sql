-- Align dev.project_hours with public: add extra_* columns and update RPCs.
-- Local uses NEXT_PUBLIC_SUPABASE_SCHEMA=dev; without this, /api/project-hours
-- fails with: column project_hours.extra_total does not exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dev'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    ALTER TABLE dev.project_hours
      ADD COLUMN IF NOT EXISTS extra_total NUMERIC NOT NULL DEFAULT 0
        CHECK (extra_total >= 0),
      ADD COLUMN IF NOT EXISTS extra_used NUMERIC NOT NULL DEFAULT 0
        CHECK (extra_used >= 0)
  $sql$;

  EXECUTE 'ALTER TABLE dev.project_hours DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_total';
  EXECUTE 'ALTER TABLE dev.project_hours DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_total';
  EXECUTE 'ALTER TABLE dev.project_hours DROP CONSTRAINT IF EXISTS project_hours_extra_used_lte_total';

  EXECUTE $sql$
    ALTER TABLE dev.project_hours_log
      DROP CONSTRAINT IF EXISTS project_hours_log_pool_check
  $sql$;
  EXECUTE $sql$
    ALTER TABLE dev.project_hours_log
      ADD CONSTRAINT project_hours_log_pool_check
      CHECK (pool IN ('management', 'programming', 'extra'))
  $sql$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION dev.matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
    RETURNS dev.project_hours
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      r dev.project_hours;
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
    $body$
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION dev.matoah_add_hours(p_pool TEXT, p_amount NUMERIC)
    RETURNS dev.project_hours
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      r dev.project_hours;
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
    $body$
  $fn$;

  EXECUTE 'ALTER FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) SET search_path = dev';
  EXECUTE 'ALTER FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) SET search_path = dev';
  EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) TO service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) TO service_role';
END $$;
NOTIFY pgrst, 'reload schema';
