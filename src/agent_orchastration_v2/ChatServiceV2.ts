/**
 * ChatServiceV2 — drop-in replacement for ChatService.
 * Implements the same handleMessage() interface so it can be swapped in DI
 * without touching socket.ts.
 *
 * Delegates all logic to PipelineV2 (deterministic state machine).
 */

import type { LlmClient } from "../agent_orchastration/llm/llmClient.js";
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { ChatRepository } from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";

import { PipelineV2 } from "./pipeline.js";
import type { ChatRequestV2, ChatResponseV2 } from "./types.js";

export class ChatServiceV2 {
  private readonly pipeline: PipelineV2;

  constructor({
    llmClient,
    vectorQueryService,
    chatRepo,
    sessionRepo,
  }: {
    llmClient: LlmClient;
    vectorQueryService: VectorQueryService;
    chatRepo: ChatRepository;
    sessionRepo: SessionRepository;
  }) {
    this.pipeline = new PipelineV2(llmClient, vectorQueryService, chatRepo, sessionRepo);
    console.log("✅ ChatServiceV2 (state-machine pipeline) initialised");
  }

  /**
   * Handles a single chat turn.
   * Signature is intentionally compatible with ChatService.handleMessage().
   */
  async handleMessage(request: ChatRequestV2): Promise<ChatResponseV2> {
    try {
      return await this.pipeline.handle(request);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ChatServiceV2] Unhandled error:", msg);
      return {
        type: "ERROR",
        message: "Sorry, I ran into an internal problem. Please try again.",
      };
    }
  }
}
