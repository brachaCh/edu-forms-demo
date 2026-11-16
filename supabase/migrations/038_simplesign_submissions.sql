-- שליחות SimpleSign לחתימת הורים (prefill + webhook)

CREATE TABLE IF NOT EXISTS public.simplesign_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_fill_id UUID NOT NULL REFERENCES public.student_form_fills(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  parent_role TEXT NOT NULL,
  signature_field_key TEXT NOT NULL,
  submission_token TEXT NOT NULL UNIQUE,
  document_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'failed', 'cancelled')),
  signing_url TEXT,
  signer_email TEXT NOT NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  signed_pdf_document_id UUID REFERENCES public.student_documents(id) ON DELETE SET NULL,
  webhook_delivery_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_fill
  ON public.simplesign_submissions(form_fill_id);
CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_student
  ON public.simplesign_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_simplesign_submissions_status
  ON public.simplesign_submissions(status);

ALTER TABLE public.simplesign_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.simplesign_submissions FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    CREATE TABLE IF NOT EXISTS dev.simplesign_submissions (
      LIKE public.simplesign_submissions INCLUDING ALL
    );

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'simplesign_submissions_form_fill_id_fkey'
        AND conrelid = 'dev.simplesign_submissions'::regclass
    ) THEN
      ALTER TABLE dev.simplesign_submissions
        ADD CONSTRAINT simplesign_submissions_form_fill_id_fkey
        FOREIGN KEY (form_fill_id) REFERENCES dev.student_form_fills(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'simplesign_submissions_student_id_fkey'
        AND conrelid = 'dev.simplesign_submissions'::regclass
    ) THEN
      ALTER TABLE dev.simplesign_submissions
        ADD CONSTRAINT simplesign_submissions_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES dev.students(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'simplesign_submissions_signed_pdf_document_id_fkey'
        AND conrelid = 'dev.simplesign_submissions'::regclass
    ) THEN
      ALTER TABLE dev.simplesign_submissions
        ADD CONSTRAINT simplesign_submissions_signed_pdf_document_id_fkey
        FOREIGN KEY (signed_pdf_document_id) REFERENCES dev.student_documents(id) ON DELETE SET NULL;
    END IF;

    ALTER TABLE dev.simplesign_submissions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE dev.simplesign_submissions FROM anon, authenticated;
  END IF;
END $$;
