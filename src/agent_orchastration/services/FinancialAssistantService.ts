import { financialAssistantGraph } from "../graph/financialAssistant.graph.js";
import type { GraphStateType } from "../graph/state.js";
import type { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "./vector.query.service.js";
import { MarketDataService } from "./marketData.service.js";

export class FinancialAssistantService {
  private readonly assistantGraph: ReturnType<
    typeof financialAssistantGraph.compile
  >;
  private readonly llmClient: LlmClient;
  private readonly vectorQueryService: VectorQueryService;
  private readonly marketDataService: MarketDataService;

  constructor({
    assistantGraph,
    llmClient,
    vectorQueryService,
    marketDataService,
  }: {
    assistantGraph: ReturnType<
      typeof financialAssistantGraph.compile
    >;
    llmClient: LlmClient;
    vectorQueryService: VectorQueryService;
    marketDataService: MarketDataService;
  }) {
    this.assistantGraph = assistantGraph;
    this.llmClient = llmClient;
    this.vectorQueryService = vectorQueryService;
    this.marketDataService = marketDataService;

    console.log(
      "✅ FinancialAssistantService received real dependencies"
    );
  }

  async run(initialState: GraphStateType) {
    console.log("🚀 FinancialAssistantService.run CALLED");

    return this.assistantGraph.invoke(initialState, {
      configurable: {
        llm: this.llmClient,
        vectorQueryService: this.vectorQueryService,
        marketDataService: this.marketDataService,
      },
    });
  }
}