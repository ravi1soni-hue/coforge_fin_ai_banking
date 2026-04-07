/**
 * Financial Assistant Graph — LangGraph StateGraph
 *
 * Simplified 5-agent architecture:
 *   START → intentAgent → [router]
 *     ├─ askUser      → followUpQuestionAgent → END
 *     ├─ confirmPath  → synthesisAgent        → END
 *     └─ analyzePath  → financeAgent → webSearchAgent → synthesisAgent → END
 *
 * intentAgent now handles intent + fact extraction + missing facts.
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state.js";

import { intentAgent } from "../agents/intentAgent.js";
import { followUpQuestionAgent } from "../agents/followUpQuestionAgent.js";
import { financeAgent } from "../agents/financeAgent.js";
import { webSearchAgent } from "../agents/webSearchAgent.js";
import { synthesisAgent } from "../agents/synthesisAgent.js";

const routeFromIntent = (state: { confirmedFollowUpAction?: string; missingFacts?: string[] }) => {
  if (state.confirmedFollowUpAction) return "confirmPath";
  if (Array.isArray(state.missingFacts) && state.missingFacts.length > 0) return "askUser";
  return "analyzePath";
};

export const financialAssistantGraph = new StateGraph(GraphState)
  .addNode("intentAgent", intentAgent)
  .addNode("followUpQuestionAgent", followUpQuestionAgent)
  .addNode("financeAgent", financeAgent)
  .addNode("webSearchAgent", webSearchAgent)
  .addNode("synthesisAgent", synthesisAgent)

  // Entry point
  .addEdge(START, "intentAgent")

  // Router: missing facts → ask user | confirmed action → direct synthesis | else → full analysis
  .addConditionalEdges("intentAgent", routeFromIntent, {
    askUser: "followUpQuestionAgent",
    confirmPath: "synthesisAgent",
    analyzePath: "financeAgent",
  })

  // Ask user → END (wait for reply in next turn)
  .addEdge("followUpQuestionAgent", END)

  // Main analysis pipeline
  .addEdge("financeAgent", "webSearchAgent")
  .addEdge("webSearchAgent", "synthesisAgent")
  .addEdge("synthesisAgent", END);

/** Compiled graph — invoke this, not the builder */
export const compiledGraph = financialAssistantGraph.compile();