// container.ts
import { createContainer, asClass, asValue } from "awilix";
import { VectorRepository } from "../repo/vector.repo.js";
import { financialAssistantGraph } from "../agent_orchastration/graph/financialAssistant.graph.js";
import { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import { FinancialAssistantService } from "../agent_orchastration/services/FinancialAssistantService.js";
import { OpenAIClient } from "../agent_orchastration/llm/openAIClient.js";
import { ChatService } from "../services/chat/chat.service.js";
import { ENV } from "./env.js";
import { db } from "../db/index.js";
import { StructuredFinancialRepository } from "../repo/structured.finance.repo.js";
import { StructuredFinancialDataService } from "../services/structured.financial.data.service.js";
import { UserService } from "../services/user.service.js";
import { UserRepository } from "../repo/user.repo.js";


const compiledGraph = financialAssistantGraph.compile();
export const container = createContainer();

// Register dependencies
container.register({

  db: asValue(db),
  

  // Singletons (lazy by default ✅)
  vectorRepo: asClass(VectorRepository).singleton(),
  vectorQueryService : asClass(VectorQueryService).singleton(),
  financialDataRepo: asClass(StructuredFinancialRepository).singleton(),
  financialDataService: asClass(StructuredFinancialDataService).singleton(),
  

// ✅ REGISTER THE API KEY
apiKey: asValue(ENV.OPENAI_API_KEY),

// ✅ compiled graph is a VALUEō
assistantGraph: asValue(compiledGraph),

assistantService: asClass(FinancialAssistantService).singleton(),
llmClient : asClass(OpenAIClient).singleton(),
userRepo: asClass(UserRepository).singleton(),
userService: asClass(UserService).singleton(),

chatService: asClass(ChatService).singleton()
});