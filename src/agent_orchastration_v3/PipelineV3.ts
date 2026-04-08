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

import type { Kysely } from "kysely";
import type { ChatRepository } from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { LlmClient } from "../agent_orchastration/llm/llmClient.js";

import { V3LlmClient } from "./llm/v3LlmClient.js";
import { createFinancialGraph, runGraphTurn, type CompiledFinancialGraph } from "./graph/workflow.js";

import type {
  ChatRequestV3,
  ChatResponseV3,
} from "./types.js";

export class PipelineV3 {
  private readonly graph: CompiledFinancialGraph;

  constructor(
    llmClient: V3LlmClient,
    /** Standard LlmClient used only by FinancialLoader's vector-DB fallback path */
    baseLlmClient: LlmClient,
    vectorQuery: VectorQueryService,
    chatRepo: ChatRepository,
    sessionRepo: SessionRepository,
    db?: Kysely<unknown>,
  ) {
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

  async handle(req: ChatRequestV3): Promise<ChatResponseV3> {
    const sessionId = req.sessionId ?? "default";

    console.log(
      `[PipelineV3] userId=${req.userId} message="${req.message.slice(0, 60)}"`,
    );

    const answer = await runGraphTurn(this.graph, {
      userId: req.userId,
      sessionId,
      userMessage: req.message,
    });

    return { type: "FINAL", message: answer };
  }
}
