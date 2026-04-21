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
import type { VectorQueryService } from "./services/vector.query.service.js";
import type { ChatRepository } from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";
import type { StructuredFinancialRepository } from "../repo/structured.finance.repo.clean.js";

// (OpenAIClient import removed)
import { V3LlmClient } from "./llm/v3LlmClient.js";
import { PipelineV3 } from "./PipelineV3.js";
import { TreasuryAnalysisService } from "./services/treasury.analysis.service.js";
import type { ChatRequestV3, ChatResponseV3 } from "./types.js";

export class ChatServiceV3 {
  private readonly pipeline: PipelineV3;

  constructor({
    apiKey,
    vectorQueryService,
    chatRepo,
    sessionRepo,
    structuredFinanceRepo,
    db,
  }: {
    apiKey: string;
    vectorQueryService: VectorQueryService;
    chatRepo: ChatRepository;
    sessionRepo: SessionRepository;
    structuredFinanceRepo: StructuredFinancialRepository;
    db?: Kysely<unknown>;
  }) {
    const v3LlmClient = new V3LlmClient(apiKey);
    // (baseLlmClient removed; only v3LlmClient is used)
    const treasuryAnalysisService = new TreasuryAnalysisService(structuredFinanceRepo);
    this.pipeline = new PipelineV3(
      v3LlmClient,
      vectorQueryService,
      treasuryAnalysisService,
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
      console.log("[ChatServiceV3] Incoming request:", JSON.stringify(request, null, 2));
      const response = await this.pipeline.handle(request);
      console.log("[ChatServiceV3] Pipeline response:", JSON.stringify(response, null, 2));
      return response;
    } catch (error: unknown) {
      console.error("[ChatServiceV3] Unhandled error (full):", error);
      if (error instanceof Error && error.stack) {
        console.error("[ChatServiceV3] Stack trace:", error.stack);
      }
      return {
        type: "ERROR",
        message: "Sorry, I ran into an internal problem. Please try again.",
      };
    }
  }
}
