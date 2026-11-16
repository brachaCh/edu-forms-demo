-- קודי OTP + סשן לקישורי חתימה ציבוריים (/sign) — רק service_role; שומרים hash בלבד

CREATE TABLE IF NOT EXISTS public.form_signature_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.form_signature_requests(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_signature_otp_codes_request_id_idx
  ON public.form_signature_otp_codes (request_id);

CREATE INDEX IF NOT EXISTS form_signature_otp_codes_expires_at_idx
  ON public.form_signature_otp_codes (expires_at);

CREATE TABLE IF NOT EXISTS public.form_signature_otp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.form_signature_requests(id) ON DELETE CASCADE,
  session_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_signature_otp_sessions_request_id_idx
  ON public.form_signature_otp_sessions (request_id);

CREATE INDEX IF NOT EXISTS form_signature_otp_sessions_expires_at_idx
  ON public.form_signature_otp_sessions (expires_at);

COMMENT ON TABLE public.form_signature_otp_codes IS
  'One-time codes for public form-signature links. Store SHA-256 hashes only. Service-role access.';
COMMENT ON TABLE public.form_signature_otp_sessions IS
  'Verified OTP sessions for public form-signature links. Store SHA-256 hashes only. Service-role access.';

ALTER TABLE public.form_signature_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_signature_otp_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.form_signature_otp_codes TO service_role;
GRANT ALL ON TABLE public.form_signature_otp_sessions TO service_role;
REVOKE ALL ON TABLE public.form_signature_otp_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.form_signature_otp_sessions FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    RETURN;
  END IF;
  IF to_regclass('dev.form_signature_requests') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS dev.form_signature_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES dev.form_signature_requests(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS dev_form_signature_otp_codes_request_id_idx
    ON dev.form_signature_otp_codes (request_id);

  CREATE INDEX IF NOT EXISTS dev_form_signature_otp_codes_expires_at_idx
    ON dev.form_signature_otp_codes (expires_at);

  CREATE TABLE IF NOT EXISTS dev.form_signature_otp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES dev.form_signature_requests(id) ON DELETE CASCADE,
    session_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS dev_form_signature_otp_sessions_request_id_idx
    ON dev.form_signature_otp_sessions (request_id);

  CREATE INDEX IF NOT EXISTS dev_form_signature_otp_sessions_expires_at_idx
    ON dev.form_signature_otp_sessions (expires_at);

  ALTER TABLE dev.form_signature_otp_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE dev.form_signature_otp_sessions ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON TABLE dev.form_signature_otp_codes TO service_role;
  GRANT ALL ON TABLE dev.form_signature_otp_sessions TO service_role;
  REVOKE ALL ON TABLE dev.form_signature_otp_codes FROM anon, authenticated;
  REVOKE ALL ON TABLE dev.form_signature_otp_sessions FROM anon, authenticated;
END $$;

NOTIFY pgrst, 'reload schema';
