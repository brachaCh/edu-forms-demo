-- חבילה אישית: מחירי יחידה לפי סוג מוסד + בחירת מכסות במוסד

CREATE TABLE IF NOT EXISTS billing_unit_prices (
  institution_type TEXT PRIMARY KEY
    CHECK (institution_type IN ('kindergartens', 'schools', 'high-schools')),
  class_price_agorot INTEGER NOT NULL DEFAULT 100000 CHECK (class_price_agorot >= 0),
  student_price_agorot INTEGER NOT NULL DEFAULT 4500 CHECK (student_price_agorot >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO billing_unit_prices (institution_type)
VALUES ('kindergartens'), ('schools'), ('high-schools')
ON CONFLICT (institution_type) DO NOTHING;

ALTER TABLE billing_unit_prices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE billing_unit_prices TO service_role;
REVOKE ALL ON TABLE billing_unit_prices FROM anon, authenticated;

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS plan_custom_classes INTEGER
    CHECK (plan_custom_classes IS NULL OR plan_custom_classes >= 0),
  ADD COLUMN IF NOT EXISTS plan_custom_students INTEGER
    CHECK (plan_custom_students IS NULL OR plan_custom_students >= 0);

CREATE TABLE IF NOT EXISTS dev.billing_unit_prices (
  institution_type TEXT PRIMARY KEY
    CHECK (institution_type IN ('kindergartens', 'schools', 'high-schools')),
  class_price_agorot INTEGER NOT NULL DEFAULT 100000 CHECK (class_price_agorot >= 0),
  student_price_agorot INTEGER NOT NULL DEFAULT 4500 CHECK (student_price_agorot >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO dev.billing_unit_prices (institution_type)
VALUES ('kindergartens'), ('schools'), ('high-schools')
ON CONFLICT (institution_type) DO NOTHING;

ALTER TABLE dev.billing_unit_prices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.billing_unit_prices TO service_role;
REVOKE ALL ON TABLE dev.billing_unit_prices FROM anon, authenticated;

ALTER TABLE dev.institutions
  ADD COLUMN IF NOT EXISTS plan_custom_classes INTEGER
    CHECK (plan_custom_classes IS NULL OR plan_custom_classes >= 0),
  ADD COLUMN IF NOT EXISTS plan_custom_students INTEGER
    CHECK (plan_custom_students IS NULL OR plan_custom_students >= 0);

NOTIFY pgrst, 'reload schema';
