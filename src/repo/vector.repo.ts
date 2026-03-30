import { VectorDocument } from "../models/vector.document.js";

export interface VectorSearchResult {
  doc: VectorDocument;
  score: number;
}

export class VectorRepository {
  private readonly documents: VectorDocument[] = [];

  /**
   * Store a single vector document
   */
  addDocument(doc: VectorDocument): void {
    this.documents.push(doc);
  }

  /**
   * Bulk insert vector documents
   */
  addDocuments(docs: VectorDocument[] = []): void {
    this.documents.push(...docs);
  }

  /**
   * Get top-K similar documents
   */
  findSimilar(
    queryEmbedding: number[],
    topK: number = 5,
    filterFn?: (doc: VectorDocument) => boolean
  ): VectorSearchResult[] {
    const scored: VectorSearchResult[] = [];

    for (const doc of this.documents) {
      if (filterFn && !filterFn(doc)) continue;

      const score = this.cosineSimilarity(
        queryEmbedding,
        doc.embedding
      );

      scored.push({ doc, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error("Vector dimensions do not match");
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}