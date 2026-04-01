/* 
To enable PgVector̥
*/
CREATE EXTENSION IF NOT EXISTS vector;

/*
  V3__create_vector_documents.sql

  vector_documents table
  - pgvector embeddings (736 dimensions)
  - numeric/long-based timestamps
  - UUIDs generated in application code
  - admin-safe (no extensions, no triggers)
*/

CREATE TABLE IF NOT EXISTS vector_documents (
  -- Identifiers
  id UUID PRIMARY KEY,

  -- Ownership & scope
  user_id UUID NOT NULL,

  -- Raw content (audit / explainability)
  content TEXT NOT NULL,

  -- Vector embedding (pgvector: 736 dims)
  embedding VECTOR(736) NOT NULL,

  -- Semantic categorization
  domain VARCHAR(50),
  facet VARCHAR(50),
  source VARCHAR(50),

  -- Flexible metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Versioning & lifecycle
  embedding_model VARCHAR(100) NOT NULL,
  embedding_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Epoch milliseconds (LONG)
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);


-- Ownership / multi-user filtering
CREATE INDEX IF NOT EXISTS idx_vector_documents_user_id
  ON vector_documents(user_id);

-- Semantic filtering
CREATE INDEX IF NOT EXISTS idx_vector_documents_domain
  ON vector_documents(domain);

CREATE INDEX IF NOT EXISTS idx_vector_documents_facet
  ON vector_documents(facet);

CREATE INDEX IF NOT EXISTS idx_vector_documents_source
  ON vector_documents(source);

-- Lifecycle filtering
CREATE INDEX IF NOT EXISTS idx_vector_documents_is_active
  ON vector_documents(is_active);

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_vector_documents_created_at
  ON vector_documents(created_at);

  -- Cosine similarity index (recommended for embeddings)
CREATE INDEX IF NOT EXISTS idx_vector_documents_embedding
  ON vector_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);