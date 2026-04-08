import { StructuredFinancialDataService } from "../../services/structured.financial.data.service.js";
import { financialAssistantGraph } from "../graph/financialAssistant.graph.js";
import type { GraphStateType } from "../graph/state.js";
import type { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "./vector.query.service.js";

export class FinancialAssistantService {
  private readonly assistantGraph: ReturnType<
    typeof financialAssistantGraph.compile
  >;
  private readonly llmClient: LlmClient;
  private readonly vectorQueryService: VectorQueryService;
  private readonly financialDataService: StructuredFinancialDataService;

  constructor({
    assistantGraph,
    llmClient,
    vectorQueryService,
    financialDataService
  }: {
    assistantGraph: ReturnType<
      typeof financialAssistantGraph.compile
    >;
    llmClient: LlmClient;
    vectorQueryService: VectorQueryService;
    financialDataService: StructuredFinancialDataService;
  }) {
    this.assistantGraph = assistantGraph;
    this.llmClient = llmClient;
    this.vectorQueryService = vectorQueryService;
    this.financialDataService = financialDataService;

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
        financialDataService: this.financialDataService
        
      },
    });
  }
}