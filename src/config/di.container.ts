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

chatService: asClass(ChatService).singleton()
});