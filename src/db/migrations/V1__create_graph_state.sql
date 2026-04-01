/*
  V1__create_graph_state.sql

  Creates the graph_state table using:
  - UUIDs generated in application code
  - Numeric status codes
  - BIGINT epoch timestamps (milliseconds)
  - JSONB state storage
  - Admin-safe DDL (no extensions, no triggers)
*/

CREATE TABLE IF NOT EXISTS graph_state (
  -- Identifiers
  id UUID PRIMARY KEY,

  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,

  /*
    Status codes:
      1 = RUNNING
      2 = WAITING_FOR_USER
      3 = COMPLETED
      4 = FAILED
  */
  status SMALLINT NOT NULL
    CHECK (status IN (1, 2, 3, 4)),

  -- Execution tracking
  current_node INTEGER,
  last_agent INTEGER,

  -- Full LangGraph snapshot
  state JSONB NOT NULL,

  error_message TEXT,

  -- Epoch milliseconds (LONG)
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);


-- Frequently queried together (chat sessions)
CREATE INDEX IF NOT EXISTS idx_graph_state_conversation_id
  ON graph_state(conversation_id);

-- Multi-user filtering
CREATE INDEX IF NOT EXISTS idx_graph_state_user_id
  ON graph_state(user_id);

-- Workflow / monitoring
CREATE INDEX IF NOT EXISTS idx_graph_state_status
  ON graph_state(status);

-- Time-based queries (latest state)
CREATE INDEX IF NOT EXISTS idx_graph_state_created_at
  ON graph_state(created_at);