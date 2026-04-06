import type { GraphStateType } from "../graph/state.js";
import type { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "./vector.query.service.js";
import { BankingReasoningEngine } from "../engine/bankingReasoningEngine.js";

export class FinancialAssistantService {
  private readonly engine: BankingReasoningEngine;

  constructor({
    llmClient,
    vectorQueryService,
  }: {
    llmClient: LlmClient;
    vectorQueryService: VectorQueryService;
  }) {
    this.engine = new BankingReasoningEngine(llmClient, vectorQueryService);
    console.log("✅ FinancialAssistantService using BankingReasoningEngine");
  }

  async run(initialState: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log("🚀 FinancialAssistantService.run CALLED");
    const result = await this.engine.run(initialState);
    return result as Partial<GraphStateType>;
  }
}