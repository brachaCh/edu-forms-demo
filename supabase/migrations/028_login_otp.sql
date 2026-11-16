-- קודי כניסה חד-פעמיים (OTP) — רק service_role; שומרים hash בלבד

CREATE TABLE IF NOT EXISTS public.login_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_otp_codes_user_id_idx
  ON public.login_otp_codes (user_id);

CREATE INDEX IF NOT EXISTS login_otp_codes_expires_at_idx
  ON public.login_otp_codes (expires_at);

COMMENT ON TABLE public.login_otp_codes IS
  'One-time login codes (email OTP). Store SHA-256 hashes only. Service-role access.';

ALTER TABLE public.login_otp_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.login_otp_codes TO service_role;
REVOKE ALL ON TABLE public.login_otp_codes FROM anon, authenticated;

-- סכמת dev
CREATE TABLE IF NOT EXISTS dev.login_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES dev.user_profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_login_otp_codes_user_id_idx
  ON dev.login_otp_codes (user_id);

CREATE INDEX IF NOT EXISTS dev_login_otp_codes_expires_at_idx
  ON dev.login_otp_codes (expires_at);

ALTER TABLE dev.login_otp_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.login_otp_codes TO service_role;
REVOKE ALL ON TABLE dev.login_otp_codes FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
