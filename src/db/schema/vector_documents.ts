import { Generated } from "kysely";

/**
 * vector_documents table
 */
export interface VectorDocumentsTable {
  id: Generated<string>;

  user_id: string;

  content: string;

  // Vector embedding (pgvector)
  embedding: readonly number[];  // VECTOR(736)

  domain: string | null;
  facet: string | null;
  source: string | null;

  metadata: unknown;

  embedding_model: string;
  embedding_version: number;
  is_active: boolean;

  created_at: Generated<bigint>;
  updated_at: Generated<bigint>;
}
