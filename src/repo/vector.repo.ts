import { Kysely, sql } from "kysely";
import { Database } from "../db/schema/index.js";

/* ---------------- Types ---------------- */

export interface VectorSearchOptions {
  topK?: number;
  domain?: string;
  facets?: string[];
  source?: string;
}

export interface CreateVectorDocumentInput {
  user_id: string;
  content: string;
  embedding: readonly number[];
  domain?: string | null;
  facet?: string | null;
  source?: string | null;
  metadata?: unknown;
  embedding_model: string;
  embedding_version?: number;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: unknown;
  distance: number;
}

/* ======================================================
 * VectorRepository — pgvector DB-backed implementation
 * ====================================================== */

export class VectorRepository {
  private readonly db: Kysely<Database>;

  constructor({ db }: { db: Kysely<Database> }) {
    this.db = db;
    console.log("✅ VectorRepository using pgvector DB");
  }

  async insertDb(input: CreateVectorDocumentInput): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const result = await trx
        .insertInto("vector_documents")
        .values({
          user_id: input.user_id,
          content: input.content,
          embedding: sql`${JSON.stringify(input.embedding)}::vector`,
          domain: input.domain ?? null,
          facet: input.facet ?? null,
          source: input.source ?? null,
          metadata: input.metadata ?? {},
          embedding_model: input.embedding_model,
          embedding_version: input.embedding_version ?? 1,
          is_active: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      return result.id;
    });
  }

  async bulkInsertDb(docs: CreateVectorDocumentInput[]): Promise<void> {
    if (!docs.length) return;

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("vector_documents")
        .values(
          docs.map((d) => ({
            user_id: d.user_id,
            content: d.content,
            embedding: sql`${JSON.stringify(d.embedding)}::vector`,
            domain: d.domain ?? null,
            facet: d.facet ?? null,
            source: d.source ?? null,
            metadata: d.metadata ?? {},
            embedding_model: d.embedding_model,
            embedding_version: d.embedding_version ?? 1,
            is_active: true,
          }))
        )
        .execute();
    });
  }

  async searchDb(
    userId: string,
    queryEmbedding: readonly number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { topK = 5, domain, facets, source } = options;

    let query = this.db
      .selectFrom("vector_documents")
      .select([
        "id",
        "content",
        "metadata",
        sql<number>`embedding <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`}`.as("distance"),
      ])
      .where("user_id", "=", userId)
      .where("is_active", "=", true);

    if (domain) {
      query = query.where("domain", "=", domain);
    }

    if (facets?.length) {
      query = query.where("facet", "in", facets);
    }

    if (source) {
      query = query.where("source", "=", source);
    }

    return query.orderBy("distance", "asc").limit(topK).execute();
  }

  async deactivateDb(id: string, userId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable("vector_documents")
        .set({
          is_active: false,
          updated_at: sql`EXTRACT(EPOCH FROM now()) * 1000`,
        })
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .execute();
    });
  }

  async deactivateAllForUser(userId: string): Promise<void> {
    await this.db
      .updateTable("vector_documents")
      .set({
        is_active: false,
        updated_at: sql`EXTRACT(EPOCH FROM now()) * 1000`,
      })
      .where("user_id", "=", userId)
      .execute();
  }
}