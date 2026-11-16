-- בקשות חתימה חיצוניות לטפסים — קישור חד־פעמי לכל שדה חתימה ונמען

CREATE TABLE IF NOT EXISTS form_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_fill_id UUID NOT NULL REFERENCES student_form_fills(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  signature_field_key TEXT NOT NULL,
  signature_field_label TEXT NOT NULL,
  form_title TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  snapshot_html TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_signature_requests_fill
  ON form_signature_requests(form_fill_id);
CREATE INDEX IF NOT EXISTS idx_form_signature_requests_token
  ON form_signature_requests(token_hash);

ALTER TABLE form_signature_requests ENABLE ROW LEVEL SECURITY;

-- אין גישה ישירה מהדפדפן; כל הפעולות עוברות דרך Edge Function עם service_role.
