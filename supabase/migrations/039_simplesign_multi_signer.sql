-- SimpleSign: מסמך רב-חותמים — submission_token משותף, מזהה לפי slot

ALTER TABLE public.simplesign_submissions
  ADD COLUMN IF NOT EXISTS signer_slot INTEGER;

ALTER TABLE public.simplesign_submissions
  DROP CONSTRAINT IF EXISTS simplesign_submissions_submission_token_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_simplesign_submissions_fill_field
  ON public.simplesign_submissions(form_fill_id, signature_field_key);

CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_token_slot
  ON public.simplesign_submissions(submission_token, signer_slot);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    ALTER TABLE dev.simplesign_submissions
      ADD COLUMN IF NOT EXISTS signer_slot INTEGER;

    ALTER TABLE dev.simplesign_submissions
      DROP CONSTRAINT IF EXISTS simplesign_submissions_submission_token_key;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_simplesign_submissions_fill_field
      ON dev.simplesign_submissions(form_fill_id, signature_field_key);

    CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_token_slot
      ON dev.simplesign_submissions(submission_token, signer_slot);
  END IF;
END $$;
