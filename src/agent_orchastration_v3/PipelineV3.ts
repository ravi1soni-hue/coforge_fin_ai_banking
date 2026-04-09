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
import type { ChatRequestV3, ChatResponseV3 } from "./types.js";
import { CompiledFinancialGraph, createFinancialGraph, runGraphTurn } from "./graph/workflow.js";
import type { ConversationTurn } from "./graph/state.js";

/** Maximum number of turns kept per session in the in-memory buffer (= max messages / 2) */
const MAX_BUFFER_TURNS = 6; // 12 messages

export class PipelineV3 {
  private readonly graph: CompiledFinancialGraph;
  private readonly chatRepo: ChatRepository;

  /**
   * In-memory conversation buffer keyed by "userId:sessionId".
   * This is the primary source of history for the current server process.
   * DB is used as persistence across restarts — within a session this buffer
   * is always up-to-date and does not depend on DB availability.
   */
  private readonly memoryBuffer = new Map<string, ConversationTurn[]>();

  constructor(
    llmClient: V3LlmClient,
    /** Used by FinancialLoader's vector-DB fallback path only */
    baseLlmClient: LlmClient,
    vectorQuery: VectorQueryService,
    chatRepo: ChatRepository,
    sessionRepo: SessionRepository,
    db?: Kysely<unknown>,
  ) {
    this.chatRepo = chatRepo;
    this.graph = createFinancialGraph({
      v3LlmClient:   llmClient,
      baseLlmClient,
      vectorQuery,
      sessionRepo,
      db,
    });
  }

  async handle(req: ChatRequestV3): Promise<ChatResponseV3> {
    const sessionId = req.sessionId ?? "default";
    const bufferKey = `${req.userId}:${sessionId}`;
    console.log(`[PipelineV3] userId=${req.userId} | "${req.message.slice(0, 80)}"`);

    // Use in-memory buffer as primary history source (always up-to-date for current session).
    // Fall back to DB only on first message (buffer empty = server just started).
    let history: ConversationTurn[] = this.memoryBuffer.get(bufferKey) ?? [];
    if (history.length === 0) {
      // Cold start — try to hydrate from DB (e.g. after server restart)
      const dbHistory = await this.chatRepo.getHistory(req.userId, sessionId, MAX_BUFFER_TURNS * 2);
      if (dbHistory.length > 0) {
        history = dbHistory;
        this.memoryBuffer.set(bufferKey, history);
      }
    }
    console.log(`[PipelineV3] history=${history.length} turns for session`);

    const answer = await runGraphTurn(this.graph, {
      userId:              req.userId,
      sessionId,
      userMessage:         req.message,
      conversationHistory: history,
    });

    // Update in-memory buffer immediately (before DB write) so the next message
    // in this session always has the full context regardless of DB latency.
    const updatedHistory: ConversationTurn[] = [
      ...history,
      { role: "user",      content: req.message },
      { role: "assistant", content: answer },
    ];
    // Keep only the most recent MAX_BUFFER_TURNS * 2 messages
    const trimmed = updatedHistory.slice(-(MAX_BUFFER_TURNS * 2));
    this.memoryBuffer.set(bufferKey, trimmed);

    // Persist to DB asynchronously — failure here does NOT affect in-memory buffer
    this.chatRepo.saveMessage(req.userId, sessionId, "user",      req.message).catch(() => {});
    this.chatRepo.saveMessage(req.userId, sessionId, "assistant", answer).catch(() => {});

    return { type: "FINAL", message: answer };
  }
}
