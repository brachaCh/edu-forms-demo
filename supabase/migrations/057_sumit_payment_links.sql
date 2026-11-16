-- קופוני SUMIT: ניתוב חבילות רגילות לדפי התשלום המתארחים (עם שדה קופון)
-- 1) דגל שמאפשר אימות תשלום מוזל (קופון הוחל בצד SUMIT)
-- 2) מיפוי sumit_item_id -> כתובת דף תשלום מתארח לכל חבילה

-- === public ===
ALTER TABLE plan_payments
  ADD COLUMN IF NOT EXISTS allow_discount BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sumit_plan_payment_links (
  sumit_item_id TEXT PRIMARY KEY,
  payment_page_url TEXT NOT NULL,
  label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sumit_plan_payment_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sumit_plan_payment_links TO service_role;
REVOKE ALL ON TABLE sumit_plan_payment_links FROM anon, authenticated;

-- === dev ===
ALTER TABLE dev.plan_payments
  ADD COLUMN IF NOT EXISTS allow_discount BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS dev.sumit_plan_payment_links (
  sumit_item_id TEXT PRIMARY KEY,
  payment_page_url TEXT NOT NULL,
  label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dev.sumit_plan_payment_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.sumit_plan_payment_links TO service_role;
REVOKE ALL ON TABLE dev.sumit_plan_payment_links FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
