import type { GraphStateType } from "../graph/state.js";
import type { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "./vector.query.service.js";
import { compiledGraph } from "../graph/financialAssistant.graph.js";
import { MarketDataService } from "./marketData.service.js";

export class FinancialAssistantService {
  private readonly llm: LlmClient;
  private readonly vectorQueryService: VectorQueryService;
  private readonly marketDataService?: MarketDataService;

  constructor({
    llmClient,
    vectorQueryService,
    marketDataService,
  }: {
    llmClient: LlmClient;
    vectorQueryService: VectorQueryService;
    marketDataService?: MarketDataService;
  }) {
    this.llm = llmClient;
    this.vectorQueryService = vectorQueryService;
    this.marketDataService = marketDataService;
    console.log("✅ FinancialAssistantService using LangGraph (compiled StateGraph)");
  }

  async run(initialState: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log("🚀 FinancialAssistantService.run CALLED via LangGraph");

    const result = await compiledGraph.invoke(initialState, {
      configurable: {
        llm:                this.llm,
        vectorQueryService: this.vectorQueryService,
        marketDataService:  this.marketDataService,
      },
    });

    return result as Partial<GraphStateType>;
  }
}