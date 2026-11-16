-- מיזוג אטומי של שדות ל-student_form_fills.data.
-- עד עכשיו כל חתימה (הורה ב-/sign, webhook של SimpleSign) קראה את ה-JSON כולו,
-- מיזגה ב-JS וכתבה בחזרה — שני חותמים בו-זמנית יכלו לדרוס אחד את השני.
-- כאן המיזוג קורה בתוך UPDATE יחיד (data || patch), כך שאין חלון מירוץ.

-- ========== public ==========
CREATE OR REPLACE FUNCTION matoah_merge_form_fill_data(
  p_fill_id UUID,
  p_patch JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  UPDATE student_form_fills
  SET
    data = COALESCE(data, '{}'::jsonb) || p_patch,
    updated_at = now()
  WHERE id = p_fill_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION matoah_merge_form_fill_data(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION matoah_merge_form_fill_data(UUID, JSONB) TO service_role;

-- ========== dev (אם קיים) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND to_regclass('dev.student_form_fills') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION dev.matoah_merge_form_fill_data(
        p_fill_id UUID,
        p_patch JSONB
      )
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = dev, public
      AS $body$
      DECLARE
        v_updated INT;
      BEGIN
        IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
          RAISE EXCEPTION 'patch must be a JSON object';
        END IF;

        UPDATE dev.student_form_fills
        SET
          data = COALESCE(data, '{}'::jsonb) || p_patch,
          updated_at = now()
        WHERE id = p_fill_id;

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        RETURN v_updated > 0;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_merge_form_fill_data(UUID, JSONB) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_merge_form_fill_data(UUID, JSONB) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
