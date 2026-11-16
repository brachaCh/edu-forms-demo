-- הזמנות מורות לכניסה למערכת — קישור חד-פעמי (רק service_role)

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_profile_id UUID
  REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS students_user_profile_id_idx
  ON public.students (user_profile_id)
  WHERE user_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.teacher_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  teacher_name TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_invitations_student_id_idx
  ON public.teacher_invitations (student_id);

CREATE INDEX IF NOT EXISTS teacher_invitations_institution_id_idx
  ON public.teacher_invitations (institution_id);

CREATE INDEX IF NOT EXISTS teacher_invitations_expires_at_idx
  ON public.teacher_invitations (expires_at);

COMMENT ON TABLE public.teacher_invitations IS
  'One-time teacher onboarding invitations. Store SHA-256 token hashes only. Service-role access.';

ALTER TABLE public.teacher_invitations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.teacher_invitations TO service_role;
REVOKE ALL ON TABLE public.teacher_invitations FROM anon, authenticated;

-- סכמת dev
ALTER TABLE dev.students
  ADD COLUMN IF NOT EXISTS user_profile_id UUID
  REFERENCES dev.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dev_students_user_profile_id_idx
  ON dev.students (user_profile_id)
  WHERE user_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dev.teacher_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES dev.institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES dev.students(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  teacher_name TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by_user_id UUID REFERENCES dev.user_profiles(id) ON DELETE SET NULL,
  created_user_id UUID REFERENCES dev.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_teacher_invitations_student_id_idx
  ON dev.teacher_invitations (student_id);

CREATE INDEX IF NOT EXISTS dev_teacher_invitations_institution_id_idx
  ON dev.teacher_invitations (institution_id);

CREATE INDEX IF NOT EXISTS dev_teacher_invitations_expires_at_idx
  ON dev.teacher_invitations (expires_at);

ALTER TABLE dev.teacher_invitations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.teacher_invitations TO service_role;
REVOKE ALL ON TABLE dev.teacher_invitations FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
