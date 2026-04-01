export class FinancialAssistantService {
    assistantGraph;
    llmClient;
    vectorQueryService;
    marketDataService;
    constructor({ assistantGraph, llmClient, vectorQueryService, marketDataService, }) {
        this.assistantGraph = assistantGraph;
        this.llmClient = llmClient;
        this.vectorQueryService = vectorQueryService;
        this.marketDataService = marketDataService;
        console.log("✅ FinancialAssistantService received real dependencies");
    }
    async run(initialState) {
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
