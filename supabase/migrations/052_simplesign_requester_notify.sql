-- SimpleSign: שמירת המשתמש ששלח לחתימה, כדי להתריע במייל כשהמסמך נחתם

ALTER TABLE public.simplesign_submissions
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.simplesign_submissions
  ADD COLUMN IF NOT EXISTS requester_email TEXT;

ALTER TABLE public.simplesign_submissions
  ADD COLUMN IF NOT EXISTS requester_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_requester
  ON public.simplesign_submissions(requested_by_user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND to_regclass('dev.simplesign_submissions') IS NOT NULL THEN
    ALTER TABLE dev.simplesign_submissions
      ADD COLUMN IF NOT EXISTS requested_by_user_id UUID;

    ALTER TABLE dev.simplesign_submissions
      ADD COLUMN IF NOT EXISTS requester_email TEXT;

    ALTER TABLE dev.simplesign_submissions
      ADD COLUMN IF NOT EXISTS requester_notified_at TIMESTAMPTZ;

    IF to_regclass('dev.user_profiles') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'simplesign_submissions_requested_by_user_id_fkey'
           AND conrelid = 'dev.simplesign_submissions'::regclass
       ) THEN
      ALTER TABLE dev.simplesign_submissions
        ADD CONSTRAINT simplesign_submissions_requested_by_user_id_fkey
        FOREIGN KEY (requested_by_user_id) REFERENCES dev.user_profiles(id) ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_requester
      ON dev.simplesign_submissions(requested_by_user_id);
  END IF;
END $$;;
