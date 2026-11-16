-- מתוה — תיקוני שלמות נתונים + עדכון שעות אטומי
-- הריצו ב-Supabase SQL Editor אחרי 001_matoah_schema.sql

-- =====================================================
-- 1. מניעת פרופילים כפולים לפי אימייל
-- =====================================================
-- הסרת כפילויות קיימות (משאיר את הרשומה הישנה ביותר לכל אימייל)
DELETE FROM user_profiles a
USING user_profiles b
WHERE a.email = b.email
  AND a.created_at > b.created_at;

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_email_key;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_email_key UNIQUE (email);

-- =====================================================
-- 2. אילוצי שלמות למאגר השעות (used <= total)
-- =====================================================
-- יישור נתונים חורגים לפני הוספת האילוץ
UPDATE project_hours
SET management_used = LEAST(management_used, management_total),
    programming_used = LEAST(programming_used, programming_total)
WHERE management_used > management_total
   OR programming_used > programming_total;

ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_management_used_lte_total;
ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_management_used_lte_total
  CHECK (management_used <= management_total);

ALTER TABLE project_hours
  DROP CONSTRAINT IF EXISTS project_hours_programming_used_lte_total;
ALTER TABLE project_hours
  ADD CONSTRAINT project_hours_programming_used_lte_total
  CHECK (programming_used <= programming_total);

-- =====================================================
-- 3. עדכון שעות אטומי (מונע race condition וניכוי-יתר)
-- =====================================================

-- ניכוי שעות: אטומי, נכשל אם אין מספיק יתרה, ורושם ליומן
CREATE OR REPLACE FUNCTION matoah_deduct_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $$
DECLARE
  r project_hours;
BEGIN
  IF p_pool NOT IN ('management', 'programming') THEN
    RAISE EXCEPTION 'מאגר שעות לא תקין';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'כמות השעות חייבת להיות מספר חיובי';
  END IF;

  SELECT * INTO r FROM project_hours ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'מאגר השעות לא הוגדר';
  END IF;

  IF p_pool = 'management' THEN
    IF r.management_used + p_amount > r.management_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET management_used = management_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    IF r.programming_used + p_amount > r.programming_total THEN
      RAISE EXCEPTION 'אין מספיק שעות במאגר';
    END IF;
    UPDATE project_hours
      SET programming_used = programming_used + p_amount
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, p_amount);
  RETURN r;
END;
$$;

-- החזרת שעות: אטומי, מוגבל למה שנוכה בפועל (ללא החזרת-יתר), ורושם ליומן
CREATE OR REPLACE FUNCTION matoah_add_hours(p_pool TEXT, p_amount NUMERIC)
RETURNS project_hours
LANGUAGE plpgsql
AS $$
DECLARE
  r project_hours;
  applied NUMERIC;
BEGIN
  IF p_pool NOT IN ('management', 'programming') THEN
    RAISE EXCEPTION 'מאגר שעות לא תקין';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'כמות השעות חייבת להיות מספר חיובי';
  END IF;

  SELECT * INTO r FROM project_hours ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'מאגר השעות לא הוגדר';
  END IF;

  IF p_pool = 'management' THEN
    applied := LEAST(p_amount, r.management_used);
    UPDATE project_hours
      SET management_used = management_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  ELSE
    applied := LEAST(p_amount, r.programming_used);
    UPDATE project_hours
      SET programming_used = programming_used - applied
      WHERE id = r.id
      RETURNING * INTO r;
  END IF;

  IF applied > 0 THEN
    INSERT INTO project_hours_log (pool, amount) VALUES (p_pool, -applied);
  END IF;
  RETURN r;
END;
$$;
