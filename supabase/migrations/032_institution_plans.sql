-- חבילות רכישה וסטטוס תשלום למוסדות

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS plan_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    CHECK (subscription_status IN ('none', 'pending_payment', 'active', 'expired', 'cancelled'))
    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sumit_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS sumit_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS plan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  amount_agorot INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  sumit_transaction_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  raw_webhook JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_payments_institution_id_idx
  ON plan_payments (institution_id);

CREATE INDEX IF NOT EXISTS plan_payments_sumit_transaction_id_idx
  ON plan_payments (sumit_transaction_id)
  WHERE sumit_transaction_id IS NOT NULL;

ALTER TABLE plan_payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE plan_payments TO service_role;
REVOKE ALL ON TABLE plan_payments FROM anon, authenticated;

-- סכמת dev (NEXT_PUBLIC_SUPABASE_SCHEMA=dev) — אותם שדות וטבלת תשלומים
ALTER TABLE dev.institutions
  ADD COLUMN IF NOT EXISTS plan_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    CHECK (subscription_status IN ('none', 'pending_payment', 'active', 'expired', 'cancelled'))
    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sumit_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS sumit_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS dev.plan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES dev.institutions(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  amount_agorot INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  sumit_transaction_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  raw_webhook JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_plan_payments_institution_id_idx
  ON dev.plan_payments (institution_id);

CREATE INDEX IF NOT EXISTS dev_plan_payments_sumit_transaction_id_idx
  ON dev.plan_payments (sumit_transaction_id)
  WHERE sumit_transaction_id IS NOT NULL;

ALTER TABLE dev.plan_payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.plan_payments TO service_role;
REVOKE ALL ON TABLE dev.plan_payments FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
