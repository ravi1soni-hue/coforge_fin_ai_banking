import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state.js";

import { intentAgent } from "../agents/intentAgent.js";
import { plannerAgent } from "../agents/plannerAgent.js";
import { plannerRouter } from "../agents/plannerRouter.js";
import { followUpQuestionAgent } from "../agents/followUpQuestionAgent.js";
import { financeAgent } from "../agents/financeAgent.js";
import { researchAgent } from "../agents/researchAgent.js";
import { reasoningAgent } from "../agents/reasoningAgent.js";
import { productRecommendationAgent } from "../agents/productRecommendationAgent.js";
import { suggestionAgent } from "../agents/suggestionAgent.js";
import { synthesisAgent } from "../agents/synthesisAgent.js";

export const financialAssistantGraph = new StateGraph(GraphState)
  .addNode("intentAgent", intentAgent)
  .addNode("plannerAgent", plannerAgent)
  .addNode("followUpQuestionAgent", followUpQuestionAgent)
  .addNode("financeAgent", financeAgent)
  .addNode("researchAgent", researchAgent)
  .addNode("reasoningAgent", reasoningAgent)
  .addNode("productRecommendationAgent", productRecommendationAgent)
  .addNode("suggestionAgent", suggestionAgent)
  .addNode("synthesisAgent", synthesisAgent)

  // ✅ Start flow
  .addEdge(START, "intentAgent")
  .addEdge("intentAgent", "plannerAgent")

  // ✅ Conditional routing after planning
  .addConditionalEdges(
    "plannerAgent",
    plannerRouter,
    {
      askUser: "followUpQuestionAgent",
      financeAgent: "financeAgent",
    }
  )

  // ✅ Ask user → END (wait for reply)
  .addEdge("followUpQuestionAgent", END)

  // ✅ Main analysis flow
  .addEdge("financeAgent", "researchAgent")
  .addEdge("researchAgent", "reasoningAgent")
  .addEdge("reasoningAgent", "productRecommendationAgent")
  .addEdge("productRecommendationAgent", "suggestionAgent")
  .addEdge("suggestionAgent", "synthesisAgent")
  .addEdge("synthesisAgent", END);