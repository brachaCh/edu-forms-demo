-- מחיר מיוחד ידני לחבילה אישית למוסד ספציפי
-- nullable: אם NULL — משתמשים במחיר הרגיל מטבלת billing_unit_prices
-- אם מוגדר — זה המחיר הסופי לאגורות (לא מכפיל, לא סיכום יחידות)

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS special_price_agorot INTEGER
    CHECK (special_price_agorot IS NULL OR special_price_agorot >= 0);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND to_regclass('dev.institutions') IS NOT NULL THEN
    ALTER TABLE dev.institutions
      ADD COLUMN IF NOT EXISTS special_price_agorot INTEGER
        CHECK (special_price_agorot IS NULL OR special_price_agorot >= 0);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
