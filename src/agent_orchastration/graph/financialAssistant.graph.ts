/**
 * Financial Assistant Graph — LangGraph StateGraph
 *
 * Simplified aligned architecture:
 *   START → intentAgent → plannerAgent → [plannerRouter]
 *     ├─ askUser    → followUpQuestionAgent → END
 *     ├─ lightPath  → confirmationAgent     → END
 *     └─ financeAgent → webSearchAgent → reasoningAgent → synthesisAgent → END
 *
 * Removed from prior graph: researchAgent, productRecommendationAgent,
 * suggestionAgent, productCatalog — their logic is folded where needed.
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state.js";

import { intentAgent } from "../agents/intentAgent.js";
import { plannerAgent } from "../agents/plannerAgent.js";
import { plannerRouter } from "../agents/plannerRouter.js";
import { followUpQuestionAgent } from "../agents/followUpQuestionAgent.js";
import { financeAgent } from "../agents/financeAgent.js";
import { webSearchAgent } from "../agents/webSearchAgent.js";
import { reasoningAgent } from "../agents/reasoningAgent.js";
import { synthesisAgent } from "../agents/synthesisAgent.js";
import { confirmationAgent } from "../agents/confirmationAgent.js";

export const financialAssistantGraph = new StateGraph(GraphState)
  .addNode("intentAgent", intentAgent)
  .addNode("plannerAgent", plannerAgent)
  .addNode("followUpQuestionAgent", followUpQuestionAgent)
  .addNode("financeAgent", financeAgent)
  .addNode("webSearchAgent", webSearchAgent)
  .addNode("reasoningAgent", reasoningAgent)
  .addNode("synthesisAgent", synthesisAgent)
  .addNode("confirmationAgent", confirmationAgent)

  // Entry point
  .addEdge(START, "intentAgent")
  .addEdge("intentAgent", "plannerAgent")

  // Router: missing facts → ask user | confirmed action → fast-path | else → full analysis
  .addConditionalEdges("plannerAgent", plannerRouter, {
    askUser:     "followUpQuestionAgent",
    lightPath:   "confirmationAgent",
    financeAgent: "financeAgent",
  })

  // Ask user → END (wait for reply in next turn)
  .addEdge("followUpQuestionAgent", END)

  // Confirmation fast-path → END (no full analysis, avoids re-running affordability)
  .addEdge("confirmationAgent", END)

  // Main analysis pipeline
  .addEdge("financeAgent", "webSearchAgent")
  .addEdge("webSearchAgent", "reasoningAgent")
  .addEdge("reasoningAgent", "synthesisAgent")
  .addEdge("synthesisAgent", END);

/** Compiled graph — invoke this, not the builder */
export const compiledGraph = financialAssistantGraph.compile();