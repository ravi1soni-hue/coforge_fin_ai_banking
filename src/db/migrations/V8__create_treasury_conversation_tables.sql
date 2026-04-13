-- Treasury conversational add-on (non-breaking)
-- Scope: DB-backed conversational analysis only.
-- No execution workflow, no approval workflow, no auto-actions.
-- Additive-only migration.

CREATE TABLE IF NOT EXISTS treasury_cashflow_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  day_name TEXT,
  total_inflows NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_outflows NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payroll_outflow NUMERIC(15, 2) NOT NULL DEFAULT 0,
  supplier_outflow NUMERIC(15, 2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(15, 2),
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  UNIQUE (user_id, business_date)
);

CREATE TABLE IF NOT EXISTS treasury_decision_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  weekly_outflow_baseline NUMERIC(15, 2) NOT NULL,
  midweek_inflow_baseline NUMERIC(15, 2) NOT NULL,
  late_inflow_count_last_4_weeks INTEGER NOT NULL DEFAULT 0,
  comfort_threshold NUMERIC(15, 2) NOT NULL,
  min_inflow_for_midweek_release NUMERIC(15, 2),
  release_condition_hit_rate_10_weeks NUMERIC(5, 2),
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  UNIQUE (user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS treasury_supplier_payment_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_ref TEXT,
  supplier_name TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  urgency TEXT NOT NULL CHECK (urgency IN ('URGENT', 'DEFERABLE')),
  due_date DATE,
  batch_hint TEXT CHECK (batch_hint IN ('T0', 'T1', 'T2')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_treasury_cashflow_daily_user_date
  ON treasury_cashflow_daily(user_id, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_snapshots_user_date
  ON treasury_decision_snapshots(user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_supplier_candidates_user_due
  ON treasury_supplier_payment_candidates(user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_treasury_supplier_candidates_urgency
  ON treasury_supplier_payment_candidates(user_id, urgency);
