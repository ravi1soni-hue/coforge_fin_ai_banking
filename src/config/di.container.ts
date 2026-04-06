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
import { ENV } from "./env.js";
import { db } from "../db.js";

export const container = createContainer();

// Register dependencies
container.register({

  db: asValue(db),

  // Singletons
  vectorRepo: asClass(VectorRepository).singleton(),
  vectorQueryService: asClass(VectorQueryService).singleton(),

  // OpenAI API key
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

  chatService: asClass(ChatService).singleton(),
});