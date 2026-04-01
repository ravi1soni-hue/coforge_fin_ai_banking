import { LlmClient } from "./llmClient.js";
var model = "gpt-5-chat";
export class OpenAIClient extends LlmClient {
    apiKey;
    constructor({ apiKey }) {
        super();
        if (!apiKey) {
            throw new Error("❌ OpenAIClient: apiKey is required");
        }
        this.apiKey = apiKey;
    }
    async generateResponse(prompt) {
        const url = "https://quasarmarket.coforge.com/qag/llmrouter-api/v2/chat/completions";
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": this.apiKey,
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: "user",
                            content: `You are a helpful AI. Reply to: ${prompt}`,
                        },
                    ],
                    temperature: 0.8,
                    top_p: 0.9,
                    max_tokens: 1000,
                }),
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API error ${response.status}: ${errorBody}`);
            }
            const data = await response.json();
            const textResponse = data?.choices?.[0]?.message?.content?.trim();
            return textResponse && textResponse.length > 0
                ? textResponse
                : "No response from AI.";
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return `Failed to connect to Quasar API: ${message}`;
        }
    }
}
