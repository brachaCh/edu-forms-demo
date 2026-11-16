-- שדות כרטיס תלמיד שילוב / תלמיד כיתה (כולל מסגרות חינוך מיוחד):
-- אפיון, מצב משפחתי, תאריך כניסה לשילוב, תאריך וועדת אפיון וזכאות,
-- מחנכת, טיפולים נוספים

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS characterization            TEXT NULL,
  ADD COLUMN IF NOT EXISTS family_status               TEXT NULL
    CHECK (
      family_status IS NULL
      OR family_status IN ('נשואים', 'פרודים', 'גרושים')
    ),
  ADD COLUMN IF NOT EXISTS integration_start_date      DATE NULL,
  ADD COLUMN IF NOT EXISTS eligibility_committee_date  DATE NULL,
  ADD COLUMN IF NOT EXISTS homeroom_teacher            TEXT NULL,
  ADD COLUMN IF NOT EXISTS additional_treatments       TEXT NULL;
