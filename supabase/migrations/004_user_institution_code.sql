-- קוד מוסד שהמשתמש הזין ברישום (לתצוגה באזור האישי)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS institution_code TEXT;
