-- בידוד לפי מוסד: חסימת גישה ישירה (anon/authenticated) לטבלאות תלמידים.
-- הגישה עוברת דרך API שרת עם service_role + בדיקת institution_id מהסשן.
-- service_role עוקף RLS — לכן המדיניות כאן חוסמת רק מפתח anon מהדפדפן.

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_form_fills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matoah_anon_all ON students;
DROP POLICY IF EXISTS matoah_anon_all ON student_documents;
DROP POLICY IF EXISTS matoah_anon_all ON student_custom_fields;
DROP POLICY IF EXISTS matoah_anon_all ON student_form_fills;

-- אין מדיניות ל-anon/authenticated → אין גישה ישירה מהלקוח.
-- (RLS מופעל + אין policy = deny-by-default עבור תפקידים שאינם bypass)
