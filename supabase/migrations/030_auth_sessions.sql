-- סשנים בשרת — ביטול בהתנתקות / שינוי סיסמה (צ'קליסט הקשחה #10)

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
  ON auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
  ON auth_sessions (id)
  WHERE revoked_at IS NULL;

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE auth_sessions TO service_role;
REVOKE ALL ON TABLE auth_sessions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS dev.auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES dev.user_profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_auth_sessions_user_idx
  ON dev.auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS dev_auth_sessions_active_idx
  ON dev.auth_sessions (id)
  WHERE revoked_at IS NULL;

ALTER TABLE dev.auth_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.auth_sessions TO service_role;
REVOKE ALL ON TABLE dev.auth_sessions FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
