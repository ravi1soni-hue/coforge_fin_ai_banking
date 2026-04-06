CREATE TABLE IF NOT EXISTS financial_data_sync (
  -- Primary Key (Auto-generated UUID)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Key link to Users table
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- External Reference (e.g., Plaid/Salt Edge connection ID)
  external_connection_id TEXT NOT NULL,

  /* 
    Status Codes:
    1 = PENDING, 2 = PROCESSING, 3 = COMPLETED, 4 = FAILED 
  */
  status SMALLINT NOT NULL 
    CHECK (status IN (1, 2, 3, 4)) 
    DEFAULT 1,

  -- Error logging for failed syncs
  error_log TEXT,

  -- Epoch Milliseconds (BIGINT)
  -- Default calculates current epoch in milliseconds
  started_at BIGINT NOT NULL 
    DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    
  completed_at BIGINT
);

-- Index for quickly finding the most recent sync jobs for a user
CREATE INDEX IF NOT EXISTS idx_sync_user_started 
  ON financial_data_sync(user_id, started_at DESC);

-- Index for lookups by external connection reference
CREATE INDEX IF NOT EXISTS idx_sync_external_ref 
  ON financial_data_sync(external_connection_id);
