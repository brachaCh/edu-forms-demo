-- ניהול מנויים: אמצעי תשלום, תזכורות חידוש

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('credit_card', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS renewal_reminder_for_expires_at TIMESTAMPTZ;

ALTER TABLE dev.institutions
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('credit_card', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS renewal_reminder_for_expires_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
