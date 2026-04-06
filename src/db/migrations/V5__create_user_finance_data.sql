CREATE TABLE IF NOT EXISTS account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_type TEXT,
  provider TEXT,
  account_ref TEXT,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  metadata JSONB DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS financial_summary_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  total_income NUMERIC(15, 2),
  total_expenses NUMERIC(15, 2),
  total_savings NUMERIC(15, 2),
  total_investments NUMERIC(15, 2),
  net_cashflow NUMERIC(15, 2),
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS loan_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_type TEXT,
  provider TEXT,
  principal_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  outstanding_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  interest_rate NUMERIC(5, 2),
  emi_amount NUMERIC(15, 2),
  tenure_months INTEGER,
  status SMALLINT NOT NULL CHECK (status IN (1, 2, 3)) DEFAULT 1,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  metadata JSONB DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS investment_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  as_of_month DATE NOT NULL,
  total_invested NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_current_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_unrealized_gain NUMERIC(15, 2),
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  investment_info JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS credit_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credit_score INTEGER,
  score_band TEXT,
  bureau TEXT,
  last_reported_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_balances_user ON account_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_summary_user_month ON financial_summary_monthly(user_id, month);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loan_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_invest_summary_user_month ON investment_summary(user_id, as_of_month);
