-- TZ-23: ישיבות צוות מוסדיות + הזמנות לאנשי צוות
-- טבלאות נפרדות מטופס «ישיבות צוות» בתיק התלמיד, כדי לאפשר הזמנה
-- בחירת מוזמנים (כרטיסי צוות של המוסד) ורשימת ישיבות עתידיות בפרופיל.

CREATE TABLE IF NOT EXISTS staff_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  notes TEXT,
  invitation_subject TEXT NOT NULL,
  invitation_text TEXT NOT NULL,
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_meetings_institution_at_idx
  ON staff_meetings (institution_id, meeting_at);

CREATE INDEX IF NOT EXISTS staff_meetings_student_idx
  ON staff_meetings (student_id);

COMMENT ON TABLE staff_meetings IS
  'Institution-scoped staff meetings (TZ-23). Owner/admin create and send invitations.';

CREATE TABLE IF NOT EXISTS staff_meeting_invitees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES staff_meetings(id) ON DELETE CASCADE,
  staff_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, email)
);

CREATE INDEX IF NOT EXISTS staff_meeting_invitees_meeting_idx
  ON staff_meeting_invitees (meeting_id);

CREATE INDEX IF NOT EXISTS staff_meeting_invitees_user_idx
  ON staff_meeting_invitees (user_id);

CREATE INDEX IF NOT EXISTS staff_meeting_invitees_staff_idx
  ON staff_meeting_invitees (staff_student_id);

COMMENT ON TABLE staff_meeting_invitees IS
  'Invitees for a staff meeting — institution staff cards (TZ-23).';

ALTER TABLE staff_meetings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE staff_meetings TO service_role;
REVOKE ALL ON TABLE staff_meetings FROM anon, authenticated;

ALTER TABLE staff_meeting_invitees ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE staff_meeting_invitees TO service_role;
REVOKE ALL ON TABLE staff_meeting_invitees FROM anon, authenticated;

-- סכמת dev
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dev'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'dev' AND table_name = 'staff_meetings'
    ) THEN
      CREATE TABLE dev.staff_meetings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id UUID NOT NULL REFERENCES dev.institutions(id) ON DELETE CASCADE,
        student_id UUID REFERENCES dev.students(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        meeting_at TIMESTAMPTZ NOT NULL,
        location TEXT,
        notes TEXT,
        invitation_subject TEXT NOT NULL,
        invitation_text TEXT NOT NULL,
        created_by UUID REFERENCES dev.user_profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS dev_staff_meetings_institution_at_idx
        ON dev.staff_meetings (institution_id, meeting_at);

      CREATE INDEX IF NOT EXISTS dev_staff_meetings_student_idx
        ON dev.staff_meetings (student_id);

      ALTER TABLE dev.staff_meetings ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON TABLE dev.staff_meetings TO service_role;
      REVOKE ALL ON TABLE dev.staff_meetings FROM anon, authenticated;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'dev' AND table_name = 'staff_meeting_invitees'
    ) THEN
      CREATE TABLE dev.staff_meeting_invitees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID NOT NULL REFERENCES dev.staff_meetings(id) ON DELETE CASCADE,
        staff_student_id UUID REFERENCES dev.students(id) ON DELETE SET NULL,
        user_id UUID REFERENCES dev.user_profiles(id) ON DELETE SET NULL,
        full_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (meeting_id, email)
      );

      CREATE INDEX IF NOT EXISTS dev_staff_meeting_invitees_meeting_idx
        ON dev.staff_meeting_invitees (meeting_id);

      CREATE INDEX IF NOT EXISTS dev_staff_meeting_invitees_user_idx
        ON dev.staff_meeting_invitees (user_id);

      CREATE INDEX IF NOT EXISTS dev_staff_meeting_invitees_staff_idx
        ON dev.staff_meeting_invitees (staff_student_id);

      ALTER TABLE dev.staff_meeting_invitees ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON TABLE dev.staff_meeting_invitees TO service_role;
      REVOKE ALL ON TABLE dev.staff_meeting_invitees FROM anon, authenticated;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
