// container.ts
import { createContainer, asClass, asValue } from "awilix";
import { VectorRepository } from "../repo/vector.repo.js";
import { ChatRepository } from "../repo/chat.repo.js";
import { SessionRepository } from "../repo/session.repo.js";
import { UserRepository } from "../repo/user.repo.js";
import { StructuredFinancialRepository } from "../repo/structured.finance.repo.js";
import { FinancialSyncRepository } from "../repo/finance_data_sync_repo.js";
import { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import { FinancialAssistantService } from "../agent_orchastration/services/FinancialAssistantService.js";
import { OpenAIClient } from "../agent_orchastration/llm/openAIClient.js";
import { ChatService } from "../services/chat/chat.service.js";
import { ChatServiceV2 } from "../agent_orchastration_v2/ChatServiceV2.js";
import { ChatServiceV3 } from "../agent_orchastration_v3/ChatServiceV3.js";
import { ENV } from "./env.js";
import { db } from "../db.js";

export const container = createContainer();

// ─── Pipeline version banner ──────────────────────────────────────────────────
console.log(`🔀 Pipeline version: ${ENV.PIPELINE_VERSION.toUpperCase()} (set PIPELINE_VERSION=v2|v3 to switch)`);

// ─── Register dependencies ────────────────────────────────────────────────────
container.register({

  db: asValue(db),

  // Singletons
  vectorRepo: asClass(VectorRepository).singleton(),
  vectorQueryService: asClass(VectorQueryService).singleton(),

  // OpenAI API key (used by both V2 and V3)
  apiKey: asValue(ENV.OPENAI_API_KEY),

  // Core services — FinancialAssistantService now uses BankingReasoningEngine internally
  assistantService: asClass(FinancialAssistantService).singleton(),
  llmClient: asClass(OpenAIClient).singleton(),

  // DB-backed repositories
  chatRepo: asClass(ChatRepository).singleton(),
  sessionRepo: asClass(SessionRepository).singleton(),
  userRepo: asClass(UserRepository).singleton(),
  structuredFinanceRepo: asClass(StructuredFinancialRepository).singleton(),
  financialSyncRepo: asClass(FinancialSyncRepository).singleton(),

  /**
   * Active chat service — controlled by PIPELINE_VERSION env var.
   *   v2 (default) → ChatServiceV2: deterministic state-machine pipeline
   *   v3            → ChatServiceV3: agentic OpenAI tool-calling pipeline
   *
   * Both implement handleMessage(request) with the same signature.
   * socket.ts resolves "chatService" and never needs to change.
   */
  chatService: ENV.PIPELINE_VERSION === "v3"
    ? asClass(ChatServiceV3).singleton()
    : asClass(ChatServiceV2).singleton(),
});