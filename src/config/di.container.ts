// container.ts
import { createContainer, asClass, asValue } from "awilix";
import { VectorRepository } from "../repo/vector.repo.js";
import { ChatRepository } from "../repo/chat.repo.js";
import { SessionRepository } from "../repo/session.repo.js";
import { UserRepository } from "../repo/user.repo.js";
import { StructuredFinancialRepository } from "../repo/structured.finance.repo.js";
import { FinancialSyncRepository } from "../repo/finance_data_sync_repo.js";
import { financialAssistantGraph } from "../agent_orchastration/graph/financialAssistant.graph.js";
import { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import { FinancialAssistantService } from "../agent_orchastration/services/FinancialAssistantService.js";
import { OpenAIClient } from "../agent_orchastration/llm/openAIClient.js";
import { ChatService } from "../services/chat/chat.service.js";
import { ENV } from "./env.js";
import { db } from "../db.js";
import { MarketDataService } from "../agent_orchastration/services/marketData.service.js";

const compiledGraph = financialAssistantGraph.compile();
export const container = createContainer();

// Register dependencies
container.register({

  db: asValue(db),
  

  // Singletons (lazy by default ✅)
  vectorRepo: asClass(VectorRepository).singleton(),
  vectorQueryService : asClass(VectorQueryService).singleton(),

// ✅ REGISTER THE API KEY
apiKey: asValue(ENV.OPENAI_API_KEY),

// ✅ compiled graph is a VALUEō
assistantGraph: asValue(compiledGraph),

assistantService: asClass(FinancialAssistantService).singleton(),
llmClient : asClass(OpenAIClient).singleton(),
marketDataService: asClass(MarketDataService).singleton(),

// DB-backed repositories
chatRepo: asClass(ChatRepository).singleton(),
sessionRepo: asClass(SessionRepository).singleton(),
userRepo: asClass(UserRepository).singleton(),
structuredFinanceRepo: asClass(StructuredFinancialRepository).singleton(),
financialSyncRepo: asClass(FinancialSyncRepository).singleton(),

chatService: asClass(ChatService).singleton()
});