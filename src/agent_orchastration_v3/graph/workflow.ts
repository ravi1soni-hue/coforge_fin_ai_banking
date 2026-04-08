/**
 * LangGraph workflow — composes all nodes into a compiled StateGraph.
 *
 * Graph topology:
 *
 *   START
 *     └─► loadContext
 *           └─► extractIntent
 *                 └─► (conditional router)
 *                       ├─► [fetchPrice ∥ fetchFx]  ← parallel fan-out
 *                       │         └─► (fan-in barrier)
 *                       │               └─► checkAffordability
 *                       │                     └─► generateResponse ──► END
 *                       └─► generateEmi ──────────────────────────────► END
 *
 * Parallel execution:
 *   fetchPrice and fetchFx are independent async operations (DuckDuckGo web
 *   search + Frankfurter FX API).  By adding edges from extractIntent to BOTH
 *   nodes and a fan-in edge from [fetchPrice, fetchFx] to checkAffordability,
 *   LangGraph runs them concurrently and waits for both before continuing.
 *
 * Conditional routing:
 *   if isEmiConfirmation=true  → skip analysis, go straight to generateEmi
 *   else                       → run parallel price+FX then affordability
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import type { Kysely } from "kysely";

import { GraphStateAnnotation, type GraphState } from "./graphState.js";
import {
  makeLoadContextNode,
  makeExtractIntentNode,
  makeFetchPriceNode,
  makeFetchFxNode,
  makeCheckAffordabilityNode,
  makeGenerateResponseNode,
  makeGenerateEmiNode,
  routeAfterIntent,
} from "./nodes.js";

import { FinancialLoader } from "../../agent_orchastration_v2/financialLoader.js";
import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { ChatRepository } from "../../repo/chat.repo.js";
import type { SessionRepository } from "../../repo/session.repo.js";
import type { VectorQueryService } from "../../agent_orchastration/services/vector.query.service.js";
import type { LlmClient } from "../../agent_orchastration/llm/llmClient.js";

export interface GraphDeps {
  v3LlmClient: V3LlmClient;
  baseLlmClient: LlmClient;
  vectorQuery: VectorQueryService;
  chatRepo: ChatRepository;
  sessionRepo: SessionRepository;
  db?: Kysely<unknown>;
}

/** Compiled LangGraph instance — invoke with initial state to run a turn */
export type CompiledFinancialGraph = ReturnType<typeof createFinancialGraph>;

/**
 * Factory that wires dependencies into node closures and compiles the graph.
 *
 * Call once at startup (e.g. in ChatServiceV3 constructor).
 * The returned compiled graph is stateless between invocations — all turn
 * state flows through the GraphState object passed to .invoke().
 */
export function createFinancialGraph(deps: GraphDeps) {
  const loader = new FinancialLoader(deps.vectorQuery, deps.baseLlmClient, deps.db);

  const loadContextNode      = makeLoadContextNode(loader, deps.chatRepo);
  const extractIntentNode    = makeExtractIntentNode();
  const fetchPriceNode       = makeFetchPriceNode();
  const fetchFxNode          = makeFetchFxNode();
  const checkAffordabilityNode = makeCheckAffordabilityNode();
  const generateResponseNode = makeGenerateResponseNode(deps.v3LlmClient, deps.chatRepo);
  const generateEmiNode      = makeGenerateEmiNode(deps.v3LlmClient, deps.chatRepo);

  const graph = new StateGraph(GraphStateAnnotation)
    // ── Nodes ────────────────────────────────────────────────────────────────
    .addNode("loadContext",       loadContextNode)
    .addNode("extractIntent",     extractIntentNode)
    .addNode("fetchPrice",        fetchPriceNode)
    .addNode("fetchFx",           fetchFxNode)
    .addNode("checkAffordability", checkAffordabilityNode)
    .addNode("generateResponse",  generateResponseNode)
    .addNode("generateEmi",       generateEmiNode)

    // ── Edges ─────────────────────────────────────────────────────────────────
    .addEdge(START,              "loadContext")
    .addEdge("loadContext",      "extractIntent")

    // After intent: conditional — EMI confirmation → generateEmi
    //                           — analysis        → parallel fetchPrice + fetchFx
    .addConditionalEdges("extractIntent", routeAfterIntent, {
      fetchPrice:  "fetchPrice",
      fetchFx:     "fetchFx",
      generateEmi: "generateEmi",
    })

    // Fan-in barrier: both parallel nodes must finish before checkAffordability
    .addEdge(["fetchPrice", "fetchFx"], "checkAffordability")

    // Sequential tail of analysis branch
    .addEdge("checkAffordability", "generateResponse")
    .addEdge("generateResponse",   END)

    // EMI branch exits directly
    .addEdge("generateEmi", END)

    .compile();

  console.log("✅ LangGraph financial assistant compiled");
  return graph;
}

/**
 * Run one conversation turn through the compiled graph.
 *
 * @param graph   Compiled graph (from createFinancialGraph)
 * @param input   Initial state — userId, sessionId, userMessage are required
 * @returns       The final response string
 */
export async function runGraphTurn(
  graph: CompiledFinancialGraph,
  input: Pick<GraphState, "userId" | "sessionId" | "userMessage">,
): Promise<string> {
  const initialState: GraphState = {
    userId: input.userId,
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    // All other fields start null / false / empty
    profile: null,
    history: [],
    product: null,
    costProvided: null,
    costCurrency: null,
    isEmiConfirmation: false,
    prevCost: null,
    prevCostCurrency: null,
    priceData: null,
    fxData: null,
    affordabilityData: null,
    response: null,
  };

  const finalState = await graph.invoke(initialState);
  return finalState.response ?? "I could not complete the analysis. Please try again.";
}
