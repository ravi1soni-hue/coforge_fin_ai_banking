-- Convert partial index to full unique index for reliable ON CONFLICT(user_id, account_ref).

DROP INDEX IF EXISTS uq_account_balances_user_account_ref;

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_balances_user_account_ref
  ON account_balances(user_id, account_ref);
