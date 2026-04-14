import axios from "axios";
import { EmbeddingService } from "./embedding.service.js";
export class OpenAiEmbeddingService extends EmbeddingService {
    apiKey;
    url;
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
        this.url =
            "https://quasarmarket.coforge.com/qag/llmrouter-api/v2/text/embeddings";
    }
    /**
     * Embed text using OpenAI-like API
     */
    async embed(text) {
        try {
            const response = await axios.post(this.url, {
                texts: [text], // API requires an array
                dimensions: 736,
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": this.apiKey,
                },
            });
            if (response.status !== 200) {
                throw new Error(`Embedding failed with status ${response.status}: ${JSON.stringify(response.data)}`);
            }
            return response.data.embeddings.map(Number);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Embedding Service Error:", message);
            throw error;
        }
    }
}
