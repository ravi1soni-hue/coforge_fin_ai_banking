CREATE TABLE IF NOT EXISTS financial_data_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_connection_id TEXT NOT NULL,
  status SMALLINT NOT NULL CHECK (status IN (1, 2, 3, 4)) DEFAULT 1,
  error_log TEXT,
  started_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sync_user_started ON financial_data_sync(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_external_ref ON financial_data_sync(external_connection_id);
