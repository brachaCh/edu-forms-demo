-- שעות פרויקט וכיתובי אתר — גישה דרך השרת בלבד (service_role).
--
-- ההרשאות האלה נשללו ידנית בפרודקשן בסבב ההקשחה, בלי מיגרציה מקבילה בריפו.
-- התוצאה: הדפדפן קיבל "permission denied for table project_hours", הווידג'ט נפל
-- לברירת מחדל של אפסים, וכל השעות נראו כאילו התאפסו. הקוד עבר מאז ל-
-- /api/project-hours ו-/api/site-text, ולכן אין יותר צורך בגישת anon.
--
-- המיגרציה מעגנת את המצב הקיים בפרודקשן ומיישרת אליו את סכמת dev.

-- ---------------------------------------------------------------------------
-- public
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS matoah_anon_all ON project_hours;
DROP POLICY IF EXISTS matoah_anon_all ON project_hours_log;
DROP POLICY IF EXISTS matoah_anon_all ON site_text_overrides;

ALTER TABLE project_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_hours_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_text_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE project_hours FROM anon, authenticated;
REVOKE ALL ON TABLE project_hours_log FROM anon, authenticated;
REVOKE ALL ON TABLE site_text_overrides FROM anon, authenticated;

GRANT ALL ON TABLE project_hours TO service_role;
GRANT ALL ON TABLE project_hours_log TO service_role;
GRANT ALL ON TABLE site_text_overrides TO service_role;

REVOKE ALL ON FUNCTION matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION matoah_add_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION matoah_deduct_hours(TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION matoah_add_hours(TEXT, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------
-- dev — אותו מצב, כדי שסביבת הפיתוח תתנהג כמו פרודקשן
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dev'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS matoah_anon_all ON dev.project_hours';
  EXECUTE 'DROP POLICY IF EXISTS matoah_anon_all ON dev.project_hours_log';
  EXECUTE 'DROP POLICY IF EXISTS matoah_anon_all ON dev.site_text_overrides';

  EXECUTE 'REVOKE ALL ON TABLE dev.project_hours FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON TABLE dev.project_hours_log FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON TABLE dev.site_text_overrides FROM anon, authenticated';

  EXECUTE 'GRANT ALL ON TABLE dev.project_hours TO service_role';
  EXECUTE 'GRANT ALL ON TABLE dev.project_hours_log TO service_role';
  EXECUTE 'GRANT ALL ON TABLE dev.site_text_overrides TO service_role';

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'dev' AND p.proname = 'matoah_deduct_hours'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_deduct_hours(TEXT, NUMERIC) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'dev' AND p.proname = 'matoah_add_hours'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dev.matoah_add_hours(TEXT, NUMERIC) TO service_role';
  END IF;
END $$;
