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
    constructor(llmClient, vectorQuery, treasuryAnalysisService, chatRepo, sessionRepo, db) {
        this.chatRepo = chatRepo;
        this.sessionRepo = sessionRepo;
        this.treasuryAnalysisService = treasuryAnalysisService;
        this.graph = createFinancialGraph({
            v3LlmClient: llmClient,
            vectorQuery,
            treasuryAnalysisService,
            sessionRepo,
            db,
        });
    }
    async handle(req) {
        const sessionId = req.sessionId ?? "default";
        console.log(`[PipelineV3] userId=${req.userId} | "${req.message.slice(0, 80)}"`);
        try {
            // Load last 6 messages (3 turns) so agents have follow-up context
            const history = await this.chatRepo.getHistory(req.userId, sessionId, 6);
            console.log("[PipelineV3] Loaded conversation history:", JSON.stringify(history, null, 2));
            const sessionFacts = await this.sessionRepo.getKnownFacts(req.userId, sessionId);
            console.log("[PipelineV3] Loaded session facts:", JSON.stringify(sessionFacts, null, 2));
            const mergedKnownFacts = {
                ...sessionFacts,
                ...(req.knownFacts ?? {}),
            };
            console.log("[PipelineV3] Merged known facts:", JSON.stringify(mergedKnownFacts, null, 2));
            await this.sessionRepo.setKnownFacts(req.userId, sessionId, mergedKnownFacts);
            const treasuryAnalysis = await this.treasuryAnalysisService.analyze(req.userId, req.message, mergedKnownFacts);
            console.log("[PipelineV3] Treasury analysis:", JSON.stringify(treasuryAnalysis, null, 2));
            const answer = await runGraphTurn(this.graph, {
                userId: req.userId,
                sessionId,
                userMessage: req.message,
                conversationHistory: history,
                knownFacts: mergedKnownFacts,
                treasuryAnalysis,
            });
            console.log("[PipelineV3] Graph answer:", answer);
            // Persist this turn so the next message has context
            await this.chatRepo.saveMessage(req.userId, sessionId, "user", req.message);
            await this.chatRepo.saveMessage(req.userId, sessionId, "assistant", answer);
            // Feedback capture: if feedback is present in the request, store it
            let feedbackId = undefined;
            if (req.feedback) {
                feedbackId = await this.chatRepo.saveFeedback({
                    userId: req.userId,
                    sessionId,
                    type: req.feedback.type,
                    comment: req.feedback.comment,
                    forMessageId: req.feedback.forMessageId,
                });
                console.log("[PipelineV3] Saved feedback with id:", feedbackId);
            }
            return { type: "FINAL", message: answer, feedbackId };
        }
        catch (err) {
            console.error("[PipelineV3] Error:", err);
            throw err;
        }
    }
}
