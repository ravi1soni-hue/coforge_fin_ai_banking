/**
 * V3 Agentic Pipeline — LangGraph-powered deterministic workflow.
 *
 * Architecture:
 *   socket.ts → ChatServiceV3 → PipelineV3 → LangGraph compiled graph
 *
 * Graph topology (see graph/workflow.ts for full diagram):
 *   START → loadContext → extractIntent
 *     → (conditional)
 *         → [fetchPrice ∥ fetchFx]  ← parallel fan-out via LangGraph edges
 *               → checkAffordability → generateResponse → END
 *         → generateEmi → END
 *
 * Key improvements over the manual tool-calling loop:
 *   • All financial computation (price, FX, affordability, EMI) is deterministic
 *     TypeScript — the LLM is called ONCE only to format the final narrative.
 *   • fetchPrice and fetchFx run in parallel (graph fan-out) — faster response.
 *   • Explicit state machine — audit the graph to understand every execution path.
 *   • No dependency on the Coforge model's unreliable tool-calling protocol.
 */
import { createFinancialGraph, runGraphTurn } from "./graph/workflow.js";
export class PipelineV3 {
    graph;
    constructor(llmClient, 
    /** Standard LlmClient used only by FinancialLoader's vector-DB fallback path */
    baseLlmClient, vectorQuery, chatRepo, sessionRepo, db) {
        this.graph = createFinancialGraph({
            v3LlmClient: llmClient,
            baseLlmClient,
            vectorQuery,
            chatRepo,
            sessionRepo,
            db,
        });
    }
    // ─── Public entry point ─────────────────────────────────────────────────────
    async handle(req) {
        const sessionId = req.sessionId ?? "default";
        console.log(`[PipelineV3] userId=${req.userId} message="${req.message.slice(0, 60)}"`);
        const answer = await runGraphTurn(this.graph, {
            userId: req.userId,
            sessionId,
            userMessage: req.message,
        });
        return { type: "FINAL", message: answer };
    }
}
