export interface VectorDocumentParams {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export class VectorDocument {
  public readonly id: string;
  public readonly text: string;
  public readonly embedding: number[];
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;

  constructor({ id, text, embedding, metadata = {} }: VectorDocumentParams) {
    this.id = id;
    this.text = text;
    this.embedding = embedding;
    this.metadata = metadata;
    this.createdAt = new Date();
  }
}