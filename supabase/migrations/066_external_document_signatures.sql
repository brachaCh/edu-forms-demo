-- TZ-151: External document signature requests
-- Allows uploading an externally-written document (e.g., תל"א)
-- and sending it to parents for signing via the existing internal signing flow.
-- Do not run this against production from the agent; apply through the
-- repo's normal migration process.

CREATE TABLE IF NOT EXISTS public.external_document_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.student_documents(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  document_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  signer_label TEXT NOT NULL DEFAULT 'הורה',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  signed_at TIMESTAMPTZ,
  signature_data TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_external_doc_sig_requests_student
  ON public.external_document_signature_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_external_doc_sig_requests_document
  ON public.external_document_signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_external_doc_sig_requests_status
  ON public.external_document_signature_requests(status);

-- Tokens table: allows multiple valid tokens per request (for reminders)
CREATE TABLE IF NOT EXISTS public.external_signature_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.external_document_signature_requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_sig_tokens_request
  ON public.external_signature_tokens(request_id);
CREATE INDEX IF NOT EXISTS idx_external_sig_tokens_hash
  ON public.external_signature_tokens(token_hash);

ALTER TABLE public.external_signature_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_signature_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.external_signature_tokens TO service_role;

ALTER TABLE public.external_document_signature_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_document_signature_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.external_document_signature_requests TO service_role;

-- OTP codes for external signature verification
CREATE TABLE IF NOT EXISTS public.external_signature_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.external_document_signature_requests(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_sig_otp_codes_request
  ON public.external_signature_otp_codes(request_id);

ALTER TABLE public.external_signature_otp_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_signature_otp_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.external_signature_otp_codes TO service_role;

-- OTP sessions for external signature verification
CREATE TABLE IF NOT EXISTS public.external_signature_otp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.external_document_signature_requests(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_sig_otp_sessions_request
  ON public.external_signature_otp_sessions(request_id);
CREATE INDEX IF NOT EXISTS idx_external_sig_otp_sessions_hash
  ON public.external_signature_otp_sessions(session_hash);

ALTER TABLE public.external_signature_otp_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_signature_otp_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.external_signature_otp_sessions TO service_role;

-- Dev schema mirror
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS dev.external_document_signature_requests (
    LIKE public.external_document_signature_requests INCLUDING ALL
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_document_signature_requests_student_id_fkey'
      AND conrelid = 'dev.external_document_signature_requests'::regclass
  ) THEN
    ALTER TABLE dev.external_document_signature_requests
      ADD CONSTRAINT external_document_signature_requests_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES dev.students(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_document_signature_requests_document_id_fkey'
      AND conrelid = 'dev.external_document_signature_requests'::regclass
  ) THEN
    ALTER TABLE dev.external_document_signature_requests
      ADD CONSTRAINT external_document_signature_requests_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES dev.student_documents(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE dev.external_document_signature_requests ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE dev.external_document_signature_requests FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE dev.external_document_signature_requests TO service_role;

  -- Tokens table for dev schema
  CREATE TABLE IF NOT EXISTS dev.external_signature_tokens (
    LIKE public.external_signature_tokens INCLUDING ALL
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_signature_tokens_request_id_fkey'
      AND conrelid = 'dev.external_signature_tokens'::regclass
  ) THEN
    ALTER TABLE dev.external_signature_tokens
      ADD CONSTRAINT external_signature_tokens_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES dev.external_document_signature_requests(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE dev.external_signature_tokens ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE dev.external_signature_tokens FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE dev.external_signature_tokens TO service_role;

  -- OTP codes for external signature verification
  CREATE TABLE IF NOT EXISTS dev.external_signature_otp_codes (
    LIKE public.external_signature_otp_codes INCLUDING ALL
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_signature_otp_codes_request_id_fkey'
      AND conrelid = 'dev.external_signature_otp_codes'::regclass
  ) THEN
    ALTER TABLE dev.external_signature_otp_codes
      ADD CONSTRAINT external_signature_otp_codes_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES dev.external_document_signature_requests(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE dev.external_signature_otp_codes ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE dev.external_signature_otp_codes FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE dev.external_signature_otp_codes TO service_role;

  -- OTP sessions for external signature verification
  CREATE TABLE IF NOT EXISTS dev.external_signature_otp_sessions (
    LIKE public.external_signature_otp_sessions INCLUDING ALL
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_signature_otp_sessions_request_id_fkey'
      AND conrelid = 'dev.external_signature_otp_sessions'::regclass
  ) THEN
    ALTER TABLE dev.external_signature_otp_sessions
      ADD CONSTRAINT external_signature_otp_sessions_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES dev.external_document_signature_requests(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE dev.external_signature_otp_sessions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE dev.external_signature_otp_sessions FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE dev.external_signature_otp_sessions TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';
