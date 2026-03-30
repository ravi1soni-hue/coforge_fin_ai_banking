import { VectorRepository, VectorSearchResult } from "../../repo/vector.repo.js";

import { getEmbeddingForText } from "../../services/embedding/embedding.helper.js";

/**
 * Options for vector search
 */
export interface VectorQueryOptions {
  topK?: number;
  filter?: (doc: VectorSearchResult["doc"]) => boolean;
}

export class VectorQueryService {
  private readonly vectorRepo: VectorRepository;

  constructor({ vectorRepo }: { vectorRepo: VectorRepository }) {
    this.vectorRepo = vectorRepo;
  }

  /**
   * Retrieve contextual text for a query
   */
  async getContext(
    query: string,
    { topK = 3, filter }: VectorQueryOptions = {}
  ): Promise<string> {
    if (!query?.trim()) return "";

    // 1️⃣ Generate query embedding
    const queryEmbedding: number[] = await getEmbeddingForText(query);

    // 2️⃣ Fetch similar vectors
    const results = this.vectorRepo.findSimilar(
      queryEmbedding,
      topK,
      filter
    );

    // 3️⃣ Build context text
    return this.buildContext(results);
  }

  /**
   * Convert vector matches into LLM-usable context
   */
  private buildContext(results: VectorSearchResult[] = []): string {
    if (!results.length) return "";

    return results
      .map(
        (item, index) =>
          `Context ${index + 1}:\n${item.doc.text}`
      )
      .join("\n\n");
  }
}