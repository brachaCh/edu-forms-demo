-- תפקיד בכרטיס איש צוות

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS role TEXT NULL;
