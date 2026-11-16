-- TZ-30: Single responsible party for students
-- Allows marking students where only one parent/guardian is the legal responsible party.
-- When set to TRUE, the confidentiality waiver requires only ONE signature instead of two.
-- Other forms already require only one parent signature - this field only affects the waiver.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS single_responsible_party BOOLEAN DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN students.single_responsible_party IS 
  'TZ-30: When TRUE, only one parent signature is required for the confidentiality waiver (single-parent, orphan, sole guardian). NULL/FALSE = two signatures required.';

-- dev schema if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    EXECUTE 'ALTER TABLE dev.students ADD COLUMN IF NOT EXISTS single_responsible_party BOOLEAN DEFAULT NULL';
    EXECUTE 'COMMENT ON COLUMN dev.students.single_responsible_party IS 
      ''TZ-30: When TRUE, only one parent signature is required for the confidentiality waiver (single-parent, orphan, sole guardian). NULL/FALSE = two signatures required.''';
  END IF;
END $$;
