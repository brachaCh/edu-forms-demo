-- סרטוני הדרכה בטבלה (במקום localStorage)
-- RLS + service_role בלבד — אין GRANT/POLICY ל-anon/authenticated (כלל מ-045)

CREATE TABLE IF NOT EXISTS tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) > 0),
  url TEXT NOT NULL CHECK (char_length(url) > 0),
  audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'teachers', 'admins')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutorials_sort_order_idx ON tutorials (sort_order ASC, created_at ASC);

ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE tutorials TO service_role;
REVOKE ALL ON TABLE tutorials FROM anon, authenticated;

-- ברירות המחדל שהיו בקוד (רק לסרטון עם קישור)
INSERT INTO tutorials (title, url, audience, sort_order)
SELECT 'איך להירשם למערכת', '/tutorials/registration-1.mp4', 'all', 0
WHERE NOT EXISTS (
  SELECT 1 FROM tutorials WHERE title = 'איך להירשם למערכת'
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS dev.tutorials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(title) > 0),
    url TEXT NOT NULL CHECK (char_length(url) > 0),
    audience TEXT NOT NULL DEFAULT 'all'
      CHECK (audience IN ('all', 'teachers', 'admins')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS dev_tutorials_sort_order_idx
    ON dev.tutorials (sort_order ASC, created_at ASC);

  ALTER TABLE dev.tutorials ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON TABLE dev.tutorials TO service_role;
  REVOKE ALL ON TABLE dev.tutorials FROM anon, authenticated;

  INSERT INTO dev.tutorials (title, url, audience, sort_order)
  SELECT 'איך להירשם למערכת', '/tutorials/registration-1.mp4', 'all', 0
  WHERE NOT EXISTS (
    SELECT 1 FROM dev.tutorials WHERE title = 'איך להירשם למערכת'
  );
END $$;

NOTIFY pgrst, 'reload schema';
