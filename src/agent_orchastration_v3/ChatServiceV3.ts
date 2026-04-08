/**
 * ChatServiceV3 — drop-in replacement for ChatServiceV2.
 *
 * Implements the same handleMessage() interface as ChatServiceV2 so it can be
 * swapped in the DI container without touching socket.ts.
 *
 * Delegates all logic to PipelineV3 (agentic tool-calling loop).
 *
 * To switch from V2 to V3:
 *   Set PIPELINE_VERSION=v3 in your .env / Railway environment variables.
 *   The DI container reads this flag and wires the correct service automatically.
 */

import type { Kysely } from "kysely";
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { ChatRepository } from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";

import { OpenAIClient } from "../agent_orchastration/llm/openAIClient.js";
import { V3LlmClient } from "./llm/v3LlmClient.js";
import { PipelineV3 } from "./PipelineV3.js";
import type { ChatRequestV3, ChatResponseV3 } from "./types.js";

export class ChatServiceV3 {
  private readonly pipeline: PipelineV3;

  constructor({
    apiKey,
    vectorQueryService,
    chatRepo,
    sessionRepo,
    db,
  }: {
    apiKey: string;
    vectorQueryService: VectorQueryService;
    chatRepo: ChatRepository;
    sessionRepo: SessionRepository;
    db?: Kysely<unknown>;
  }) {
    const v3LlmClient = new V3LlmClient(apiKey);
    // OpenAIClient is only used by FinancialLoader's tertiary vector-DB fallback path
    const baseLlmClient = new OpenAIClient({ apiKey });
    this.pipeline = new PipelineV3(
      v3LlmClient,
      baseLlmClient,
      vectorQueryService,
      chatRepo,
      sessionRepo,
      db,
    );
    console.log("✅ ChatServiceV3 (agentic tool-calling pipeline) initialised");
  }

  /**
   * Handles a single chat turn.
   * Signature is intentionally identical to ChatServiceV2.handleMessage().
   */
  async handleMessage(request: ChatRequestV3): Promise<ChatResponseV3> {
    try {
      return await this.pipeline.handle(request);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ChatServiceV3] Unhandled error:", msg);
      return {
        type: "ERROR",
        message: "Sorry, I ran into an internal problem. Please try again.",
      };
    }
  }
}
