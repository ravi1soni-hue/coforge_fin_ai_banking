import { VectorRepository } from "../../repo/vector.repo.js";
import type { VectorSearchOptions } from "../../repo/vector.repo.js";
import { getEmbeddingForText } from "../../services/embedding/embedding.helper.js";

export type { VectorSearchOptions };

export class VectorQueryService {
  private readonly vectorRepo: VectorRepository;

  constructor({ vectorRepo }: { vectorRepo: VectorRepository }) {
    this.vectorRepo = vectorRepo;
  }

  /**
   * Retrieve contextual text for a query using pgvector similarity search
   */
  async getContext(
    userId: string,
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<string> {
    if (!query?.trim()) return "";

    // 1️⃣ Generate query embedding
    const queryEmbedding = await getEmbeddingForText(query);

    // 2️⃣ Fetch similar vectors from DB (pgvector)
    const results = await this.vectorRepo.searchDb(
      userId,
      queryEmbedding,
      {
        topK: options.topK ?? 8,
        domain: options.domain,
        facets: options.facets,
        source: options.source,
      }
    );

    // 3️⃣ Build LLM context string
    return this.buildContext(results);
  }

  private buildContext(results: Array<{ content: string; distance: number }>): string {
    if (!results.length) return "";

    return results
      .map((item, index) => `Context ${index + 1}:\n${item.content}`)
      .join("\n\n");
  }
}