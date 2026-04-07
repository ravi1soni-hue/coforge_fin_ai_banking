/**
 * ChatServiceV2 — drop-in replacement for ChatService.
 * Implements the same handleMessage() interface so it can be swapped in DI
 * without touching socket.ts.
 *
 * Delegates all logic to PipelineV2 (deterministic state machine).
 */
import { PipelineV2 } from "./pipeline.js";
export class ChatServiceV2 {
    pipeline;
    constructor({ llmClient, vectorQueryService, chatRepo, sessionRepo, db, }) {
        this.pipeline = new PipelineV2(llmClient, vectorQueryService, chatRepo, sessionRepo, db);
        console.log("✅ ChatServiceV2 (state-machine pipeline) initialised");
    }
    /**
     * Handles a single chat turn.
     * Signature is intentionally compatible with ChatService.handleMessage().
     */
    async handleMessage(request) {
        try {
            return await this.pipeline.handle(request);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("[ChatServiceV2] Unhandled error:", msg);
            return {
                type: "ERROR",
                message: "Sorry, I ran into an internal problem. Please try again.",
            };
        }
    }
}
