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

  constructor({
    assistantGraph,
    llmClient,
    vectorQueryService,
  }: {
    assistantGraph: ReturnType<
      typeof financialAssistantGraph.compile
    >;
    llmClient: LlmClient;
    vectorQueryService: VectorQueryService;
  }) {
    this.assistantGraph = assistantGraph;
    this.llmClient = llmClient;
    this.vectorQueryService = vectorQueryService;

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
      },
    });
  }
}