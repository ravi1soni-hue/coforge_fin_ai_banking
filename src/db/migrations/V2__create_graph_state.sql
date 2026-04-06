CREATE TABLE IF NOT EXISTS graph_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status SMALLINT NOT NULL CHECK (status IN (1, 2, 3, 4)),
  current_node INTEGER,
  last_agent INTEGER,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_graph_state_conversation_id ON graph_state(conversation_id);
CREATE INDEX IF NOT EXISTS idx_graph_state_user_id ON graph_state(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_state_status ON graph_state(status);
CREATE INDEX IF NOT EXISTS idx_graph_state_created_at ON graph_state(created_at);
