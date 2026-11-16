-- TZ-68 school-year expiry backfill — rollback.
-- NOT a migration. Restores plan_expires_at, renewal reminder stamp, and
-- subscription_status from subscription_expiry_backup_tz68.
-- Safe to run twice: restores the same backup snapshot.
-- Does not drop the backup table.

-- ========== public ==========
UPDATE public.institutions i
SET
  plan_expires_at = b.old_plan_expires_at,
  renewal_reminder_for_expires_at = b.old_renewal_reminder_for_expires_at,
  subscription_status = COALESCE(b.old_subscription_status, i.subscription_status)
FROM public.subscription_expiry_backup_tz68 b
WHERE i.id = b.institution_id;

-- ========== dev (skip if schema/table missing) ==========
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dev'
      AND table_name = 'subscription_expiry_backup_tz68'
  ) THEN
    UPDATE dev.institutions i
    SET
      plan_expires_at = b.old_plan_expires_at,
      renewal_reminder_for_expires_at = b.old_renewal_reminder_for_expires_at,
      subscription_status = COALESCE(b.old_subscription_status, i.subscription_status)
    FROM dev.subscription_expiry_backup_tz68 b
    WHERE i.id = b.institution_id;
  END IF;
END $$;
