-- Ensure one monthly summary per user per month.
-- Safe migration:
-- 1) Remove existing duplicates while keeping the latest row by created_at/id.
-- 2) Enforce uniqueness for future inserts.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, month
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM financial_summary_monthly
)
DELETE FROM financial_summary_monthly f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_summary_monthly_user_month
  ON financial_summary_monthly(user_id, month);
