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

import type { Kysely } from "kysely";
import type { ChatRepository }    from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";
import type { VectorQueryService } from "./services/vector.query.service.js";
import type { LlmClient }         from "./llm/llmClient.js";
import type { TreasuryAnalysisService } from "./services/treasury.analysis.service.js";

import { V3LlmClient } from "./llm/v3LlmClient.js";
import type { ChatRequestV3, ChatResponseV3 } from "./types.js";
import { CompiledFinancialGraph, createFinancialGraph, runGraphTurn } from "./graph/workflow.js";

export class PipelineV3 {
  private readonly graph: CompiledFinancialGraph;
  private readonly chatRepo: ChatRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly treasuryAnalysisService: TreasuryAnalysisService;

  constructor(
    llmClient: V3LlmClient,
    /** Used by FinancialLoader's vector-DB fallback path only */
    baseLlmClient: LlmClient,
    vectorQuery: VectorQueryService,
    treasuryAnalysisService: TreasuryAnalysisService,
    chatRepo: ChatRepository,
    sessionRepo: SessionRepository,
    db?: Kysely<unknown>,
  ) {
    this.chatRepo = chatRepo;
    this.sessionRepo = sessionRepo;
    this.treasuryAnalysisService = treasuryAnalysisService;
    this.graph = createFinancialGraph({
      v3LlmClient:   llmClient,
      baseLlmClient,
      vectorQuery,
      treasuryAnalysisService,
      sessionRepo,
      db,
    });
  }

  async handle(req: ChatRequestV3): Promise<ChatResponseV3> {
    const sessionId = req.sessionId ?? "default";
    console.log(`[PipelineV3] userId=${req.userId} | "${req.message.slice(0, 80)}"`);

    // Load last 6 messages (3 turns) so agents have follow-up context
    const history = await this.chatRepo.getHistory(req.userId, sessionId, 6);

    const sessionFacts = await this.sessionRepo.getKnownFacts(req.userId, sessionId);
    const mergedKnownFacts = {
      ...sessionFacts,
      ...(req.knownFacts ?? {}),
    };
    await this.sessionRepo.setKnownFacts(req.userId, sessionId, mergedKnownFacts);

    const treasuryAnalysis = await this.treasuryAnalysisService.analyze(
      req.userId,
      req.message,
      mergedKnownFacts,
    );

    const answer = await runGraphTurn(this.graph, {
      userId:              req.userId,
      sessionId,
      userMessage:         req.message,
      conversationHistory: history,
      knownFacts:          mergedKnownFacts,
      treasuryAnalysis,
    });

    // Persist this turn so the next message has context
    await this.chatRepo.saveMessage(req.userId, sessionId, "user",      req.message);
    await this.chatRepo.saveMessage(req.userId, sessionId, "assistant", answer);

    return { type: "FINAL", message: answer };
  }
}
