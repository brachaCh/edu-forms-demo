-- SimpleSign: התרעה למורה האחראית כשמסמך נחתם (פעם אחת לכל submission)

ALTER TABLE public.simplesign_submissions
  ADD COLUMN IF NOT EXISTS teacher_notified_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev')
     AND to_regclass('dev.simplesign_submissions') IS NOT NULL THEN
    ALTER TABLE dev.simplesign_submissions
      ADD COLUMN IF NOT EXISTS teacher_notified_at TIMESTAMPTZ;
  END IF;
END $$;
