-- TZ-99: scanned paper confidentiality waiver
-- A staff-uploaded PDF/image can satisfy the student-file waiver gate
-- the same way a completed digital parent signature does.
-- Do not run this against production from the agent; apply through the
-- repo's normal migration process.

ALTER TABLE public.student_documents
  ADD COLUMN IF NOT EXISTS is_paper_waiver BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.student_documents.is_paper_waiver IS
  'TZ-99: TRUE when this document is a scanned paper confidentiality waiver that satisfies the student-file gate.';

CREATE UNIQUE INDEX IF NOT EXISTS student_documents_one_active_paper_waiver
  ON public.student_documents (student_id)
  WHERE is_paper_waiver IS TRUE AND archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dev' AND table_name = 'student_documents'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE dev.student_documents ADD COLUMN IF NOT EXISTS is_paper_waiver BOOLEAN NOT NULL DEFAULT FALSE';
  EXECUTE $c$
    COMMENT ON COLUMN dev.student_documents.is_paper_waiver IS
      'TZ-99: TRUE when this document is a scanned paper confidentiality waiver that satisfies the student-file gate.'
  $c$;
  EXECUTE $i$
    CREATE UNIQUE INDEX IF NOT EXISTS dev_student_documents_one_active_paper_waiver
      ON dev.student_documents (student_id)
      WHERE is_paper_waiver IS TRUE AND archived_at IS NULL
  $i$;
END $$;

NOTIFY pgrst, 'reload schema';
