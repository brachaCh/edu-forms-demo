-- TZ-18: Add separate email fields for father and mother
-- Required for confidentiality waiver that needs both parents' signatures

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS father_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS mother_email TEXT NULL;

-- No indexes needed; these are rarely queried directly
