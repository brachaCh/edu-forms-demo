-- סיסמת כניסה לפרופיל משתמש (hash בלבד)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
