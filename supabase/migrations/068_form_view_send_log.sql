-- TZ-view: Send forms/timetables for viewing (read-only, no signature)

-- View requests: stores snapshot HTML for read-only viewing
CREATE TABLE IF NOT EXISTS form_view_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_fill_id UUID REFERENCES student_form_fills(id) ON DELETE SET NULL,
  form_id TEXT NOT NULL,
  form_title TEXT NOT NULL,
  student_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  snapshot_html TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE form_view_requests IS
  'Token-protected read-only form view requests. snapshotHtml stored at send time.';

CREATE INDEX IF NOT EXISTS form_view_requests_token_hash_idx
  ON form_view_requests (token_hash);
CREATE INDEX IF NOT EXISTS form_view_requests_form_fill_idx
  ON form_view_requests (form_fill_id)
  WHERE form_fill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS form_view_requests_expires_at_idx
  ON form_view_requests (expires_at)
  WHERE status = 'pending';

-- RLS: no direct browser access; all operations via API with service_role
ALTER TABLE form_view_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE form_view_requests TO service_role;
REVOKE ALL ON TABLE form_view_requests FROM PUBLIC, anon, authenticated;

-- Send log: tracks who sent what to which role (no PII)
CREATE TABLE IF NOT EXISTS form_view_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  form_fill_id UUID REFERENCES student_form_fills(id) ON DELETE SET NULL,
  form_id TEXT NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  recipient_role TEXT NOT NULL,
  sent_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE form_view_send_log IS
  'Log of form/timetable sends for viewing (not signature). Does not store email addresses.';
COMMENT ON COLUMN form_view_send_log.form_id IS
  'Form schema id (e.g. weekly-schedule, accommodations)';
COMMENT ON COLUMN form_view_send_log.recipient_role IS
  'Role of recipient: parent, homeroom, principal';

CREATE INDEX IF NOT EXISTS form_view_send_log_institution_idx
  ON form_view_send_log (institution_id);
CREATE INDEX IF NOT EXISTS form_view_send_log_form_fill_idx
  ON form_view_send_log (form_fill_id)
  WHERE form_fill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS form_view_send_log_student_idx
  ON form_view_send_log (student_id)
  WHERE student_id IS NOT NULL;

-- RLS: no direct browser access; all writes via API with service_role
ALTER TABLE form_view_send_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE form_view_send_log TO service_role;
REVOKE ALL ON TABLE form_view_send_log FROM PUBLIC, anon, authenticated;
