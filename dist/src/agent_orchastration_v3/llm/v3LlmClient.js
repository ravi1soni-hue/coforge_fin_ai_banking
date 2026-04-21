/**
 * V3 LLM Client — CANONICAL LLM INTERFACE (2026+)
 *
 * This is the ONLY supported LLM client for all agentic operations.
 * All agents must use this class for LLM calls.
 * Legacy clients (llmClient.ts, openAIClient.ts) are deprecated and must not be used.
 *
 * Multi-agent financial assistant: wraps the Coforge endpoint for the new agent-based architecture.
 * Each agent sends a message array and receives a plain-text reply.
 * No tool-calling loop — agents call real APIs (webSearch, exchangeRate) directly in code and use the LLM purely for reasoning and extraction.
 */
import { extractJson } from "../../utils/jsonExtractor.js";
const API_URL = "https://quasarmarket.coforge.com/qag/llmrouter-api/v2/chat/completions";
const MODEL = "gpt-5-chat";
export class V3LlmClient {
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
        if (!apiKey) {
            throw new Error("❌ V3LlmClient: apiKey is required");
        }
    }
    /**
     * Send a message array to the LLM and return the plain-text reply.
     * Each agent uses this directly — no tool-calling loop needed.
     */
    async chat(messages) {
        console.log("[V3LlmClient] chat called with messages:", JSON.stringify(messages));
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": this.apiKey,
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages,
                    temperature: 0.3,
                    top_p: 0.9,
                    max_tokens: 1200,
                }),
            });
            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[V3LlmClient] chat API error ${response.status}:`, errorBody);
                throw new Error(`API error ${response.status}: ${errorBody}`);
            }
            const data = await response.json();
            const rawContent = (data?.choices?.[0]?.message?.content ?? "").trim();
            if (!rawContent)
                throw new Error("No content returned from API");
            console.log("[V3LlmClient] chat rawContent:", rawContent);
            return rawContent;
        }
        catch (err) {
            console.error("[V3LlmClient] chat error:", err);
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`V3LlmClient.chat failed: ${message}`);
        }
    }
    /**
     * Like chat() but prompts the LLM to return JSON, runs extractJson() on the
     * response, and returns the parsed object.  Used by agents that need
     * structured output (supervisor, research, affordability).
     */
    async chatJSON(messages) {
        console.log("[V3LlmClient] chatJSON called with messages:", JSON.stringify(messages));
        const raw = await this.chat(messages);
        if (!raw)
            throw new Error("chatJSON: empty response from LLM");
        let extracted;
        try {
            extracted = extractJson(raw);
            console.log("[V3LlmClient] chatJSON extracted JSON:", extracted);
            return JSON.parse(extracted);
        }
        catch (err) {
            console.error("[V3LlmClient] chatJSON error:", err, "Raw:", raw);
            throw new Error(`chatJSON: LLM did not return valid JSON.\nRaw: ${raw.slice(0, 300)}`);
        }
    }
}
