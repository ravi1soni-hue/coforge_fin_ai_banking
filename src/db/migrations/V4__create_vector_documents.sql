/* Enable PgVector */
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vector_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(736) NOT NULL,
  domain VARCHAR(50),
  facet VARCHAR(50),
  source VARCHAR(50),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_model VARCHAR(100) NOT NULL,
  embedding_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_vector_documents_user_id ON vector_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_vector_documents_is_active ON vector_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_vector_documents_created_at ON vector_documents(created_at);

CREATE INDEX IF NOT EXISTS idx_vector_documents_embedding
  ON vector_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
