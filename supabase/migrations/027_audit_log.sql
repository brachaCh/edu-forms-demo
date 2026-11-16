-- לוג פעולות במערכת — מעקב אחרי פעולות משתמשים ברמת מוסד

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_institution_created_idx
  ON audit_log (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_action_idx
  ON audit_log (action);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE audit_log TO service_role;
REVOKE ALL ON TABLE audit_log FROM anon, authenticated;

-- סכמת dev
CREATE TABLE IF NOT EXISTS dev.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES dev.institutions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES dev.user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_audit_log_institution_created_idx
  ON dev.audit_log (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dev_audit_log_entity_idx
  ON dev.audit_log (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dev_audit_log_action_idx
  ON dev.audit_log (action);

ALTER TABLE dev.audit_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dev.audit_log TO service_role;
REVOKE ALL ON TABLE dev.audit_log FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
