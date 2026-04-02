export class VectorDocument {
    id;
    text;
    embedding;
    metadata;
    createdAt;
    constructor({ id, text, embedding, metadata = {} }) {
        this.id = id;
        this.text = text;
        this.embedding = embedding;
        this.metadata = metadata;
        this.createdAt = new Date();
    }
}
