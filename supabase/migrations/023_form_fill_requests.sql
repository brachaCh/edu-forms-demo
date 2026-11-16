-- בקשות מילוי חיצוניות לטפסים (שליחה למחנכת) — קישור אישי חד־פעמי

CREATE TABLE IF NOT EXISTS form_fill_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_fill_id UUID NOT NULL REFERENCES student_form_fills(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  form_title TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  token_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_fill_requests_fill
  ON form_fill_requests(form_fill_id);
CREATE INDEX IF NOT EXISTS idx_form_fill_requests_token
  ON form_fill_requests(token_hash);

ALTER TABLE form_fill_requests ENABLE ROW LEVEL SECURITY;

-- אין גישה ישירה מהדפדפן; כל הפעולות עוברות דרך Edge Function עם service_role.
