-- TZ-68: backfill existing institution subscriptions to school-year expiry.
-- Mirrors src/lib/billing/school-year-expiry.ts → computeSchoolYearExpiry
-- (and computeSchoolYearExpiryForBackfill for the never-shorten predicate).
--
-- Rule (Asia/Jerusalem):
--   purchase on/after 1 Aug Y → exclusive end 00:00 on 2 Oct Y+1 Israel time
--   purchase before 1 Aug Y  → exclusive end 00:00 on 2 Oct Y Israel time
-- Stored plan_expires_at is that exclusive instant (plan stays active through
-- the whole of 1 October Israel time).
--
-- Guards:
--   * Only EXTEND; never shorten an expiry already later than computed.
--   * L1: never touch active rows whose plan_expires_at IS NULL (unlimited access).
--   * L1: only update when the computed new expiry is in the future (now()).
--   * L2: expired rows only if paid_at IS NOT NULL (completed payment);
--     never flip an unpaid expired row to active.
--   * Skip cancelled institutions and institutions whose latest plan_payment
--     is refunded (no later completed payment).
--   * Idempotent: a second run matches 0 rows (dates already at/above target).
--   * Backup first: subscription_expiry_backup_tz68 (RLS on, no public policies).
--   * Reminder guard: if the new expiry falls within 30 days
--     (RENEWAL_REMINDER_DAYS in subscription-lifecycle.ts), stamp
--     renewal_reminder_for_expires_at = new expiry so cron/edge
--     subscription-reminders will not blast emails. If the new expiry is
--     further out, clear the stamp so the normal 30-day reminder can fire later.
--   * Reactivate expired → active only when paid_at IS NOT NULL and the new
--     expiry is still in the future.

-- ========== SQL mirror of computeSchoolYearExpiry ==========
CREATE OR REPLACE FUNCTION public.tz68_compute_school_year_expiry(purchased_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  -- Keep in lockstep with computeSchoolYearExpiry in
  -- src/lib/billing/school-year-expiry.ts
  SELECT
    (
      CASE
        WHEN (purchased_at AT TIME ZONE 'Asia/Jerusalem')::date
             >= make_date(
                  EXTRACT(YEAR FROM (purchased_at AT TIME ZONE 'Asia/Jerusalem'))::int,
                  8, 1
                )
          THEN make_date(
                 EXTRACT(YEAR FROM (purchased_at AT TIME ZONE 'Asia/Jerusalem'))::int + 1,
                 10, 2
               )
        ELSE make_date(
               EXTRACT(YEAR FROM (purchased_at AT TIME ZONE 'Asia/Jerusalem'))::int,
               10, 2
             )
      END
    )::timestamp AT TIME ZONE 'Asia/Jerusalem'
$$;

REVOKE ALL ON FUNCTION public.tz68_compute_school_year_expiry(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tz68_compute_school_year_expiry(timestamptz)
  TO service_role;

-- ========== backup table (public) ==========
CREATE TABLE IF NOT EXISTS public.subscription_expiry_backup_tz68 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  old_plan_expires_at TIMESTAMPTZ,
  new_plan_expires_at TIMESTAMPTZ NOT NULL,
  old_renewal_reminder_for_expires_at TIMESTAMPTZ,
  old_subscription_status TEXT,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id)
);

ALTER TABLE public.subscription_expiry_backup_tz68 ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny-by-default for anon/authenticated.
GRANT ALL ON TABLE public.subscription_expiry_backup_tz68 TO service_role;
REVOKE ALL ON TABLE public.subscription_expiry_backup_tz68 FROM anon, authenticated;

-- ========== backup + backfill (public) ==========
INSERT INTO public.subscription_expiry_backup_tz68 (
  institution_id,
  old_plan_expires_at,
  new_plan_expires_at,
  old_renewal_reminder_for_expires_at,
  old_subscription_status
)
SELECT
  i.id,
  i.plan_expires_at,
  public.tz68_compute_school_year_expiry(
    COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
  ) AS new_plan_expires_at,
  i.renewal_reminder_for_expires_at,
  i.subscription_status
FROM public.institutions i
WHERE (
    (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
    OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
  )
  AND COALESCE(i.paid_at, i.plan_selected_at, i.created_at) IS NOT NULL
  AND public.tz68_compute_school_year_expiry(
        COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
      ) IS NOT NULL
  AND public.tz68_compute_school_year_expiry(
        COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
      ) > now()
  AND (
    i.plan_expires_at IS NULL
    OR public.tz68_compute_school_year_expiry(
         COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
       ) > i.plan_expires_at
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.plan_payments refunded
    WHERE refunded.institution_id = i.id
      AND refunded.status = 'refunded'
      AND NOT EXISTS (
        SELECT 1
        FROM public.plan_payments later
        WHERE later.institution_id = i.id
          AND later.status = 'completed'
          AND later.created_at > refunded.created_at
      )
  )
ON CONFLICT (institution_id) DO NOTHING;

UPDATE public.institutions i
SET
  plan_expires_at = t.new_plan_expires_at,
  renewal_reminder_for_expires_at = CASE
    WHEN t.new_plan_expires_at <= now() + interval '30 days'
      THEN t.new_plan_expires_at
    ELSE NULL
  END,
  subscription_status = CASE
    WHEN i.subscription_status = 'expired'
         AND i.paid_at IS NOT NULL
         AND t.new_plan_expires_at > now()
      THEN 'active'
    ELSE i.subscription_status
  END
FROM public.subscription_expiry_backup_tz68 t
WHERE i.id = t.institution_id
  AND (
    (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
    OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
  )
  AND t.new_plan_expires_at > now()
  AND (
    i.plan_expires_at IS NULL
    OR t.new_plan_expires_at > i.plan_expires_at
  );

-- ========== dev schema (if present) ==========
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dev' AND table_name = 'institutions'
  ) THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS dev.subscription_expiry_backup_tz68 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES dev.institutions(id) ON DELETE CASCADE,
    old_plan_expires_at TIMESTAMPTZ,
    new_plan_expires_at TIMESTAMPTZ NOT NULL,
    old_renewal_reminder_for_expires_at TIMESTAMPTZ,
    old_subscription_status TEXT,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (institution_id)
  );

  ALTER TABLE dev.subscription_expiry_backup_tz68 ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON TABLE dev.subscription_expiry_backup_tz68 TO service_role;
  REVOKE ALL ON TABLE dev.subscription_expiry_backup_tz68 FROM anon, authenticated;

  INSERT INTO dev.subscription_expiry_backup_tz68 (
    institution_id,
    old_plan_expires_at,
    new_plan_expires_at,
    old_renewal_reminder_for_expires_at,
    old_subscription_status
  )
  SELECT
    i.id,
    i.plan_expires_at,
    public.tz68_compute_school_year_expiry(
      COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
    ) AS new_plan_expires_at,
    i.renewal_reminder_for_expires_at,
    i.subscription_status
  FROM dev.institutions i
  WHERE (
      (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
      OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
    )
    AND COALESCE(i.paid_at, i.plan_selected_at, i.created_at) IS NOT NULL
    AND public.tz68_compute_school_year_expiry(
          COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
        ) IS NOT NULL
    AND public.tz68_compute_school_year_expiry(
          COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
        ) > now()
    AND (
      i.plan_expires_at IS NULL
      OR public.tz68_compute_school_year_expiry(
           COALESCE(i.paid_at, i.plan_selected_at, i.created_at)
         ) > i.plan_expires_at
    )
    AND NOT EXISTS (
      SELECT 1
      FROM dev.plan_payments refunded
      WHERE refunded.institution_id = i.id
        AND refunded.status = 'refunded'
        AND NOT EXISTS (
          SELECT 1
          FROM dev.plan_payments later
          WHERE later.institution_id = i.id
            AND later.status = 'completed'
            AND later.created_at > refunded.created_at
        )
    )
  ON CONFLICT (institution_id) DO NOTHING;

  UPDATE dev.institutions i
  SET
    plan_expires_at = t.new_plan_expires_at,
    renewal_reminder_for_expires_at = CASE
      WHEN t.new_plan_expires_at <= now() + interval '30 days'
        THEN t.new_plan_expires_at
      ELSE NULL
    END,
  subscription_status = CASE
    WHEN i.subscription_status = 'expired'
         AND i.paid_at IS NOT NULL
         AND t.new_plan_expires_at > now()
      THEN 'active'
    ELSE i.subscription_status
  END
FROM dev.subscription_expiry_backup_tz68 t
WHERE i.id = t.institution_id
  AND (
    (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
    OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
  )
  AND t.new_plan_expires_at > now()
  AND (
    i.plan_expires_at IS NULL
    OR t.new_plan_expires_at > i.plan_expires_at
  );
END $$;

NOTIFY pgrst, 'reload schema';
