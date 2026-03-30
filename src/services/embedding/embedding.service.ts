// embedding.service.ts

export abstract class EmbeddingService {
    /**
     * Embed text and return a numeric vector
     */
    abstract embed(text: string): Promise<number[]>;
  }