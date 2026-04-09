/**
 * V3 Pipeline — entry point for the multi-agent LangGraph financial assistant.
 *
 * Architecture:
 *   socket.ts → ChatServiceV3 → PipelineV3 → LangGraph compiled graph
 *
 * Graph (see graph/workflow.ts):
 *   loadProfile → supervisor (LLM) → research (parallel) → affordability (LLM) → synthesis (LLM)
 *
 * Every routing decision is made by the supervisor agent's LLM reasoning.
 * No regex, no hardcoded rules.
 */
import { createFinancialGraph, runGraphTurn } from "./graph/workflow.js";
export class PipelineV3 {
    graph;
    constructor(llmClient, 
    /** Used by FinancialLoader's vector-DB fallback path only */
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
    async handle(req) {
        const sessionId = req.sessionId ?? "default";
        console.log(`[PipelineV3] userId=${req.userId} | "${req.message.slice(0, 80)}"`);
        const answer = await runGraphTurn(this.graph, {
            userId: req.userId,
            sessionId,
            userMessage: req.message,
        });
        return { type: "FINAL", message: answer };
    }
}
