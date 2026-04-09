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
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { LlmClient }         from "../agent_orchastration/llm/llmClient.js";

import { V3LlmClient } from "./llm/v3LlmClient.js";
import { createFinancialGraph, runGraphTurn, type CompiledFinancialGraph } from "./graph/workflow.js";
import type { ChatRequestV3, ChatResponseV3 } from "./types.js";

export class PipelineV3 {
  private readonly graph: CompiledFinancialGraph;

  constructor(
    llmClient: V3LlmClient,
    /** Used by FinancialLoader's vector-DB fallback path only */
    baseLlmClient: LlmClient,
    vectorQuery: VectorQueryService,
    chatRepo: ChatRepository,
    sessionRepo: SessionRepository,
    db?: Kysely<unknown>,
  ) {
    this.graph = createFinancialGraph({
      v3LlmClient:   llmClient,
      baseLlmClient,
      vectorQuery,
      chatRepo,
      sessionRepo,
      db,
    });
  }

  async handle(req: ChatRequestV3): Promise<ChatResponseV3> {
    const sessionId = req.sessionId ?? "default";
    console.log(`[PipelineV3] userId=${req.userId} | "${req.message.slice(0, 80)}"`);

    const answer = await runGraphTurn(this.graph, {
      userId:      req.userId,
      sessionId,
      userMessage: req.message,
    });

    return { type: "FINAL", message: answer };
  }
}
