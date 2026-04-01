import { getEmbeddingForText } from "../../services/embedding/embedding.helper.js";
export class VectorQueryService {
    vectorRepo;
    constructor({ vectorRepo }) {
        this.vectorRepo = vectorRepo;
    }
    /**
     * Retrieve contextual text for a query
     */
    async getContext(query, { topK = 3, filter } = {}) {
        if (!query?.trim())
            return "";
        // 1️⃣ Generate query embedding
        const queryEmbedding = await getEmbeddingForText(query);
        // 2️⃣ Fetch similar vectors
        const results = this.vectorRepo.findSimilar(queryEmbedding, topK, filter);
        // 3️⃣ Build context text
        return this.buildContext(results);
    }
    /**
     * Convert vector matches into LLM-usable context
     */
    buildContext(results = []) {
        if (!results.length)
            return "";
        return results
            .map((item, index) => `Context ${index + 1}:\n${item.doc.text}`)
            .join("\n\n");
    }
}
