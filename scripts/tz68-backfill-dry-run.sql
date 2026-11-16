-- TZ-68 school-year expiry backfill — READ-ONLY dry run.
-- NOT a migration. Does not UPDATE/INSERT/DELETE.
-- Do not select student names or other personal student info.
--
-- SQL mirror of computeSchoolYearExpiry /
-- computeSchoolYearExpiryForBackfill in
-- src/lib/billing/school-year-expiry.ts
-- (same CASE as public.tz68_compute_school_year_expiry in
--  supabase/migrations/064_tz68_backfill_school_year_expiry.sql).
--
-- Would-change predicate (must match the migration):
--   active with a non-null plan_expires_at, or expired with paid_at set
--   L1: never touch active + NULL expiry (unlimited access)
--   L1: computed new expiry must be in the future (now())
--   L2: expired only if paid_at is not null (never flip unpaid → active)
--   never shorten (new > old, or old is null on a paid expired row)
--   skip cancelled / unpaid-expired / unlimited-active
--   skip refunded latest payment (refunded with no later completed payment)

-- ========== public: rows that would change ==========
WITH purchase AS (
  SELECT
    i.id AS institution_id,
    COALESCE(i.paid_at, i.plan_selected_at, i.created_at) AS purchase_at,
    i.plan_expires_at AS old_plan_expires_at
  FROM public.institutions i
  WHERE (
      (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
      OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
    )
    AND COALESCE(i.paid_at, i.plan_selected_at, i.created_at) IS NOT NULL
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
),
computed AS (
  SELECT
    p.institution_id,
    p.purchase_at,
    (p.purchase_at AT TIME ZONE 'Asia/Jerusalem')::date AS purchase_date_il,
    p.old_plan_expires_at,
    (
      CASE
        WHEN (p.purchase_at AT TIME ZONE 'Asia/Jerusalem')::date
             >= make_date(
                  EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
                  8, 1
                )
          THEN make_date(
                 EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int + 1,
                 10, 2
               )
        ELSE make_date(
               EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
               10, 2
             )
      END
    )::timestamp AT TIME ZONE 'Asia/Jerusalem' AS new_plan_expires_at
  FROM purchase p
)
SELECT
  institution_id,
  purchase_at,
  purchase_date_il,
  old_plan_expires_at,
  new_plan_expires_at
FROM computed
WHERE new_plan_expires_at IS NOT NULL
  AND new_plan_expires_at > now()
  AND (
    old_plan_expires_at IS NULL
    OR new_plan_expires_at > old_plan_expires_at
  )
ORDER BY purchase_date_il, institution_id;

-- ========== public: count ==========
WITH purchase AS (
  SELECT
    i.id AS institution_id,
    COALESCE(i.paid_at, i.plan_selected_at, i.created_at) AS purchase_at,
    i.plan_expires_at AS old_plan_expires_at
  FROM public.institutions i
  WHERE (
      (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
      OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
    )
    AND COALESCE(i.paid_at, i.plan_selected_at, i.created_at) IS NOT NULL
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
),
computed AS (
  SELECT
    p.institution_id,
    p.old_plan_expires_at,
    (
      CASE
        WHEN (p.purchase_at AT TIME ZONE 'Asia/Jerusalem')::date
             >= make_date(
                  EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
                  8, 1
                )
          THEN make_date(
                 EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int + 1,
                 10, 2
               )
        ELSE make_date(
               EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
               10, 2
             )
      END
    )::timestamp AT TIME ZONE 'Asia/Jerusalem' AS new_plan_expires_at
  FROM purchase p
)
SELECT count(*) AS would_change_count
FROM computed
WHERE new_plan_expires_at IS NOT NULL
  AND new_plan_expires_at > now()
  AND (
    old_plan_expires_at IS NULL
    OR new_plan_expires_at > old_plan_expires_at
  );

-- ========== dev: rows that would change ==========
-- Requires the `dev` schema (created in 025_dev_schema.sql). Skip this
-- section if that schema is not present.

WITH purchase AS (
  SELECT
    i.id AS institution_id,
    COALESCE(i.paid_at, i.plan_selected_at, i.created_at) AS purchase_at,
    i.plan_expires_at AS old_plan_expires_at
  FROM dev.institutions i
  WHERE (
      (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
      OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
    )
    AND COALESCE(i.paid_at, i.plan_selected_at, i.created_at) IS NOT NULL
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
),
computed AS (
  SELECT
    p.institution_id,
    p.purchase_at,
    (p.purchase_at AT TIME ZONE 'Asia/Jerusalem')::date AS purchase_date_il,
    p.old_plan_expires_at,
    (
      CASE
        WHEN (p.purchase_at AT TIME ZONE 'Asia/Jerusalem')::date
             >= make_date(
                  EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
                  8, 1
                )
          THEN make_date(
                 EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int + 1,
                 10, 2
               )
        ELSE make_date(
               EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
               10, 2
             )
      END
    )::timestamp AT TIME ZONE 'Asia/Jerusalem' AS new_plan_expires_at
  FROM purchase p
)
SELECT
  institution_id,
  purchase_at,
  purchase_date_il,
  old_plan_expires_at,
  new_plan_expires_at
FROM computed
WHERE new_plan_expires_at IS NOT NULL
  AND new_plan_expires_at > now()
  AND (
    old_plan_expires_at IS NULL
    OR new_plan_expires_at > old_plan_expires_at
  )
ORDER BY purchase_date_il, institution_id;

-- ========== dev: count ==========
WITH purchase AS (
  SELECT
    i.id AS institution_id,
    COALESCE(i.paid_at, i.plan_selected_at, i.created_at) AS purchase_at,
    i.plan_expires_at AS old_plan_expires_at
  FROM dev.institutions i
  WHERE (
      (i.subscription_status = 'active' AND i.plan_expires_at IS NOT NULL)
      OR (i.subscription_status = 'expired' AND i.paid_at IS NOT NULL)
    )
    AND COALESCE(i.paid_at, i.plan_selected_at, i.created_at) IS NOT NULL
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
),
computed AS (
  SELECT
    p.institution_id,
    p.old_plan_expires_at,
    (
      CASE
        WHEN (p.purchase_at AT TIME ZONE 'Asia/Jerusalem')::date
             >= make_date(
                  EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
                  8, 1
                )
          THEN make_date(
                 EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int + 1,
                 10, 2
               )
        ELSE make_date(
               EXTRACT(YEAR FROM (p.purchase_at AT TIME ZONE 'Asia/Jerusalem'))::int,
               10, 2
             )
      END
    )::timestamp AT TIME ZONE 'Asia/Jerusalem' AS new_plan_expires_at
  FROM purchase p
)
SELECT count(*) AS would_change_count
FROM computed
WHERE new_plan_expires_at IS NOT NULL
  AND new_plan_expires_at > now()
  AND (
    old_plan_expires_at IS NULL
    OR new_plan_expires_at > old_plan_expires_at
  );
