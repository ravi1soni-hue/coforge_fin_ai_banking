export class VectorRepository {
    documents = [];
    /**
     * Store a single vector document
     */
    addDocument(doc) {
        this.documents.push(doc);
    }
    /**
     * Bulk insert vector documents
     */
    addDocuments(docs = []) {
        this.documents.push(...docs);
    }
    /**
     * Get top-K similar documents
     */
    findSimilar(queryEmbedding, topK = 5, filterFn) {
        const scored = [];
        for (const doc of this.documents) {
            if (filterFn && !filterFn(doc))
                continue;
            const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
            scored.push({ doc, score });
        }
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
    /**
     * Cosine similarity between two vectors
     */
    cosineSimilarity(vecA, vecB) {
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
