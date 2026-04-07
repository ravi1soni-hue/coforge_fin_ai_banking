import { compiledGraph } from "../graph/financialAssistant.graph.js";
export class FinancialAssistantService {
    llm;
    vectorQueryService;
    marketDataService;
    constructor({ llmClient, vectorQueryService, marketDataService, }) {
        this.llm = llmClient;
        this.vectorQueryService = vectorQueryService;
        this.marketDataService = marketDataService;
        console.log("✅ FinancialAssistantService using LangGraph (compiled StateGraph)");
    }
    async run(initialState) {
        console.log("🚀 FinancialAssistantService.run CALLED via LangGraph");
        const result = await compiledGraph.invoke(initialState, {
            configurable: {
                llm: this.llm,
                vectorQueryService: this.vectorQueryService,
                marketDataService: this.marketDataService,
            },
        });
        return result;
    }
}
