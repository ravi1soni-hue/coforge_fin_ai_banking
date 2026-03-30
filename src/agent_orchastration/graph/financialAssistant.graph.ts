import { StateGraph,START, END } from "@langchain/langgraph";
import { GraphState } from "./state.js";

import { intentAgent } from "../agents/intentAgent.js";
import { plannerAgent } from "../agents/plannerAgent.js";
import { plannerRouter } from "../agents/plannerRouter.js";
import { financeAgent } from "../agents/financeAgent.js";
import { researchAgent } from "../agents/researchAgent.js";
import { reasoningAgent } from "../agents/reasoningAgent.js";
import { synthesisAgent } from "../agents/synthesisAgent.js";



// financialAssistantGraph.invoke(
//     initialState,
//     {
//       configurable: {
//         llm,
//         vectorQueryService,
//       }
//     }
//   )

export const financialAssistantGraph = new StateGraph(GraphState)
  .addNode("intentAgent", intentAgent)
  .addNode("plannerAgent", plannerAgent)
  .addNode("financeAgent", financeAgent)
  .addNode("researchAgent", researchAgent)
  .addNode("reasoningAgent", reasoningAgent)
  .addNode("synthesisAgent", synthesisAgent)

  .addEdge(START, "intentAgent")
  .addEdge("intentAgent", "plannerAgent")

  .addConditionalEdges(
    "plannerAgent",
    plannerRouter,
    {
      askUser: "financeAgent",
      financeAgent: "financeAgent",
    }
  )

  .addEdge("financeAgent", "researchAgent")
  .addEdge("researchAgent", "reasoningAgent")
  .addEdge("reasoningAgent", "synthesisAgent")
  .addEdge("synthesisAgent", END);