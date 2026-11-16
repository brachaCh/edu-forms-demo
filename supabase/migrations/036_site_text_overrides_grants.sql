-- הרשאות קריאה/כתיבה לטבלת כיתובי מערכת (חסר GRANT גורם ל-permission denied)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_text_overrides TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dev' AND table_name = 'site_text_overrides'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dev.site_text_overrides TO anon, authenticated';
  END IF;
END $$;
