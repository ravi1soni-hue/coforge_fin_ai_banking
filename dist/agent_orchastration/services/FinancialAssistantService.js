export class FinancialAssistantService {
    assistantGraph;
    llmClient;
    vectorQueryService;
    constructor({ assistantGraph, llmClient, vectorQueryService, }) {
        this.assistantGraph = assistantGraph;
        this.llmClient = llmClient;
        this.vectorQueryService = vectorQueryService;
        console.log("✅ FinancialAssistantService received real dependencies");
    }
    async run(initialState) {
        console.log("🚀 FinancialAssistantService.run CALLED");
        return this.assistantGraph.invoke(initialState, {
            configurable: {
                llm: this.llmClient,
                vectorQueryService: this.vectorQueryService,
            },
        });
    }
}
