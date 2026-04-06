import { Generated } from "kysely";

/**
 * vector_documents table
 * (long timestamps + numeric-friendly typing)
 */
export interface VectorDocumentsTable {
  // UUID
  id: Generated<string>;

  // Ownership & scope
  user_id: string;

  // Raw content
  content: string;

  // Vector embedding (pgvector)
  embedding: readonly number[];  // VECTOR(736)

  // Semantic categorization
  domain: string | null;
  facet: string | null;
  source: string | null;

  // JSONB metadata
  metadata: unknown;

  // Versioning
  embedding_model: string;
  embedding_version: number;
  is_active: boolean;

  // Epoch millis (BIGINT)
  created_at: Generated<bigint>;
  updated_at: Generated<bigint>;
}