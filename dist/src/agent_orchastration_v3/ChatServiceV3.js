/**
 * ChatServiceV3 — drop-in replacement for ChatServiceV2.
 *
 * Implements the same handleMessage() interface as ChatServiceV2 so it can be
 * swapped in the DI container without touching socket.ts.
 *
 * Delegates all logic to PipelineV3 (agentic tool-calling loop).
 *
 * To switch from V2 to V3:
 *   Set PIPELINE_VERSION=v3 in your .env / Railway environment variables.
 *   The DI container reads this flag and wires the correct service automatically.
 */
// (OpenAIClient import removed)
import { V3LlmClient } from "./llm/v3LlmClient.js";
import { PipelineV3 } from "./PipelineV3.js";
import { TreasuryAnalysisService } from "./services/treasury.analysis.service.js";
export class ChatServiceV3 {
    pipeline;
    constructor({ apiKey, vectorQueryService, chatRepo, sessionRepo, structuredFinanceRepo, db, }) {
        const v3LlmClient = new V3LlmClient(apiKey);
        // (baseLlmClient removed; only v3LlmClient is used)
        const treasuryAnalysisService = new TreasuryAnalysisService(structuredFinanceRepo);
        this.pipeline = new PipelineV3(v3LlmClient, vectorQueryService, treasuryAnalysisService, chatRepo, sessionRepo, db);
        console.log("✅ ChatServiceV3 (agentic tool-calling pipeline) initialised");
    }
    /**
     * Handles a single chat turn.
     * Signature is intentionally identical to ChatServiceV2.handleMessage().
     */
    async handleMessage(request) {
        try {
            return await this.pipeline.handle(request);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("[ChatServiceV3] Unhandled error:", msg);
            return {
                type: "ERROR",
                message: "Sorry, I ran into an internal problem. Please try again.",
            };
        }
    }
}
