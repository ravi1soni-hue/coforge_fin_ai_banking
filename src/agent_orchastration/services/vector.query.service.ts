import { VectorRepository } from "../../repo/vector.repo.js";
import { getEmbeddingForText } from "../../services/embedding/embedding.helper.js";

/* ---------------- Types ---------------- */

export interface VectorQueryOptions {
  topK?: number;
  domain?: string;
  facets?: string[];
  source?: string;
}

/* ---------------- Service ---------------- */

export class VectorQueryService {

  private readonly vectorRepo: VectorRepository
  constructor({
    vectorRepo,
  }: {
    vectorRepo: VectorRepository;
  }) {
    this.vectorRepo = vectorRepo;
  }

  /**
   * Retrieve contextual text for an LLM query
   */
  async getContext(
    userId: string,
    query: string,
    options: VectorQueryOptions = {}
  ): Promise<string> {
    if (!query?.trim()) return "";

    /* -----------------------------
     * 1️⃣ Generate query embedding
     * ----------------------------- */
    const queryEmbedding = await getEmbeddingForText(query);

    /* -----------------------------
     * 2️⃣ Fetch similar vectors (DB)
     * ----------------------------- */
    const results = await this.vectorRepo.searchDb(
      userId,
      queryEmbedding,
      {
        topK: options.topK ?? 3,
        domain: options.domain,
        facets: options.facets,
        source: options.source,
      }
    );

    /* -----------------------------
     * 3️⃣ Build LLM context string
     * ----------------------------- */
    return this.buildContext(results);
  }

  /**
   * Convert vector matches into LLM‑usable context
   */
  private buildContext(
    results: Array<{
      content: string;
      distance: number;
    }>
  ): string {
    if (!results.length) return "";

    return results
      .map(
        (item, index) =>
          `Context ${index + 1}:\n${item.content}`
      )
      .join("\n\n");
  }
}