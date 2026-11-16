-- תומכת חינוך — שדה בכרטיס תלמיד סל אישי

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS education_support TEXT NULL;
