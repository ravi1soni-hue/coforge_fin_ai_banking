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
    chatRepo;
    sessionRepo;
    treasuryAnalysisService;
    constructor(llmClient, 
    /** Used by FinancialLoader's vector-DB fallback path only */
    baseLlmClient, vectorQuery, treasuryAnalysisService, chatRepo, sessionRepo, db) {
        this.chatRepo = chatRepo;
        this.sessionRepo = sessionRepo;
        this.treasuryAnalysisService = treasuryAnalysisService;
        this.graph = createFinancialGraph({
            v3LlmClient: llmClient,
            baseLlmClient,
            vectorQuery,
            treasuryAnalysisService,
            sessionRepo,
            db,
        });
    }
    async handle(req) {
        const sessionId = req.sessionId ?? "default";
        console.log(`[PipelineV3] userId=${req.userId} | "${req.message.slice(0, 80)}"`);
        // Load last 6 messages (3 turns) so agents have follow-up context
        const history = await this.chatRepo.getHistory(req.userId, sessionId, 6);
        console.log("[PipelineV3] Loaded conversation history:", JSON.stringify(history, null, 2));
        const sessionFacts = await this.sessionRepo.getKnownFacts(req.userId, sessionId);
        const mergedKnownFacts = {
            ...sessionFacts,
            ...(req.knownFacts ?? {}),
        };
        await this.sessionRepo.setKnownFacts(req.userId, sessionId, mergedKnownFacts);
        const treasuryAnalysis = await this.treasuryAnalysisService.analyze(req.userId, req.message, mergedKnownFacts);
        const answer = await runGraphTurn(this.graph, {
            userId: req.userId,
            sessionId,
            userMessage: req.message,
            conversationHistory: history,
            knownFacts: mergedKnownFacts,
            treasuryAnalysis,
        });
        // Persist this turn so the next message has context
        await this.chatRepo.saveMessage(req.userId, sessionId, "user", req.message);
        await this.chatRepo.saveMessage(req.userId, sessionId, "assistant", answer);
        return { type: "FINAL", message: answer };
    }
}
