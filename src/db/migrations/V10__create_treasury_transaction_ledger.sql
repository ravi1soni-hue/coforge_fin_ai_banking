-- Treasury ledger hardening for demo confidence.
-- 1) Prevent duplicate account balance rows per user/account_ref.
-- 2) Add account-level treasury transaction ledger for drilldown views.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, account_ref
      ORDER BY updated_at DESC, id DESC
    ) AS rn
  FROM account_balances
  WHERE account_ref IS NOT NULL
)
DELETE FROM account_balances a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_balances_user_account_ref
  ON account_balances(user_id, account_ref);

CREATE TABLE IF NOT EXISTS treasury_account_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_ref TEXT NOT NULL,
  txn_ref TEXT NOT NULL,
  txn_date DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  category TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  counterparty TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  UNIQUE (user_id, txn_ref)
);

CREATE INDEX IF NOT EXISTS idx_treasury_txn_user_date
  ON treasury_account_transactions(user_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_txn_user_account_date
  ON treasury_account_transactions(user_id, account_ref, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_txn_user_category
  ON treasury_account_transactions(user_id, category);
