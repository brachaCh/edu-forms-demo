-- TZ-153: Add 'expired' and 'renewing' to simplesign_submissions status
-- When SimpleSign returns expired, we store it and create a new submission on resend.
-- 'renewing' prevents duplicate submissions during the renewal process.
-- renewing_started_at tracks when renewal started, for stale lock detection.

ALTER TABLE public.simplesign_submissions
  DROP CONSTRAINT IF EXISTS simplesign_submissions_status_check;

ALTER TABLE public.simplesign_submissions
  ADD CONSTRAINT simplesign_submissions_status_check
  CHECK (status IN ('pending', 'signed', 'failed', 'cancelled', 'expired', 'renewing'));

ALTER TABLE public.simplesign_submissions
  ADD COLUMN IF NOT EXISTS renewing_started_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    ALTER TABLE dev.simplesign_submissions
      DROP CONSTRAINT IF EXISTS simplesign_submissions_status_check;

    ALTER TABLE dev.simplesign_submissions
      ADD CONSTRAINT simplesign_submissions_status_check
      CHECK (status IN ('pending', 'signed', 'failed', 'cancelled', 'expired', 'renewing'));

    ALTER TABLE dev.simplesign_submissions
      ADD COLUMN IF NOT EXISTS renewing_started_at timestamptz;
  END IF;
END $$;
