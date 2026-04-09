/**
 * LangGraph workflow — multi-agent financial assistant (clean architecture).
 *
 * Graph topology:
 *   START → loadProfile → supervisor → [research?] → [affordability?] → synthesis → END
 *
 * All routing decisions are made by the supervisor agent's LLM output (AgentPlan).
 * No regex, no hardcoded rules.
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { FinancialGraphState } from "./state.js";
import { runSupervisorAgent } from "../agents/supervisor.agent.js";
import { runResearchAgent } from "../agents/research.agent.js";
import { runAffordabilityAgent } from "../agents/affordability.agent.js";
import { runSynthesisAgent } from "../agents/synthesis.agent.js";
import { FinancialLoader } from "../../agent_orchastration_v2/financialLoader.js";
// ─── Node factory functions ───────────────────────────────────────────────────
function makeLoadProfileNode(loader) {
    return async function loadProfileNode(state) {
        console.log("[loadProfile] userId=" + state.userId);
        const profile = await loader.loadProfile(state.userId, {});
        console.log("[loadProfile] name=" + (profile.userName ?? "unknown") + " savings=" + profile.availableSavings + " " + profile.homeCurrency);
        return { userProfile: profile };
    };
}
function makeSupervisorNode(llmClient) {
    return async function supervisorNode(state) {
        console.log("[supervisor] Analysing query: " + state.userMessage.slice(0, 80));
        const plan = await runSupervisorAgent(llmClient, state.userMessage, state.userProfile ?? {}, state.conversationHistory ?? []);
        return { plan };
    };
}
function makeResearchNode(llmClient) {
    return async function researchNode(state) {
        console.log("[research] Starting parallel research (price + FX + news)...");
        const { priceInfo, fxInfo, newsInfo } = await runResearchAgent(llmClient, state.plan);
        console.log("[research] Done — price=" + (priceInfo?.price ?? "none") + " " + (priceInfo?.currency ?? "") + " fx=" + (fxInfo?.rate ?? "none") + " news=" + (newsInfo?.headlines?.length ?? 0));
        return { priceInfo, fxInfo, newsInfo };
    };
}
function makeAffordabilityNode(llmClient) {
    return async function affordabilityNode(state) {
        console.log("[affordability] Running LLM analysis...");
        const affordabilityInfo = await runAffordabilityAgent(llmClient, state);
        console.log("[affordability] Verdict=" + affordabilityInfo.verdict + " canAfford=" + affordabilityInfo.canAfford);
        return { affordabilityInfo };
    };
}
function makeSynthesisNode(llmClient) {
    return async function synthesisNode(state) {
        console.log("[synthesis] Generating final response...");
        const finalResponse = await runSynthesisAgent(llmClient, state);
        return { finalResponse };
    };
}
// ─── Conditional routing ──────────────────────────────────────────────────────
function routeAfterSupervisor(state) {
    const p = state.plan;
    if (!p)
        return "synthesis";
    if (p.needsWebSearch || p.needsFxConversion || p.needsNews)
        return "research";
    if (p.needsAffordability)
        return "affordability";
    return "synthesis";
}
function routeAfterResearch(state) {
    return state.plan?.needsAffordability ? "affordability" : "synthesis";
}
// ─── Graph factory ────────────────────────────────────────────────────────────
export function createFinancialGraph(deps) {
    const loader = new FinancialLoader(deps.vectorQuery, deps.baseLlmClient, deps.db);
    const compiled = new StateGraph(FinancialGraphState)
        .addNode("loadProfile", makeLoadProfileNode(loader))
        .addNode("supervisor", makeSupervisorNode(deps.v3LlmClient))
        .addNode("research", makeResearchNode(deps.v3LlmClient))
        .addNode("affordability", makeAffordabilityNode(deps.v3LlmClient))
        .addNode("synthesis", makeSynthesisNode(deps.v3LlmClient))
        .addEdge(START, "loadProfile")
        .addEdge("loadProfile", "supervisor")
        .addConditionalEdges("supervisor", routeAfterSupervisor, {
        research: "research",
        affordability: "affordability",
        synthesis: "synthesis",
    })
        .addConditionalEdges("research", routeAfterResearch, {
        affordability: "affordability",
        synthesis: "synthesis",
    })
        .addEdge("affordability", "synthesis")
        .addEdge("synthesis", END)
        .compile();
    console.log("✅ Financial graph compiled: supervisor → research → affordability → synthesis");
    return compiled;
}
// ─── Turn runner ──────────────────────────────────────────────────────────────
export async function runGraphTurn(graph, input) {
    const result = await graph.invoke({
        userId: input.userId,
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        conversationHistory: input.conversationHistory ?? [],
        userProfile: null,
        plan: null,
        priceInfo: null,
        fxInfo: null,
        newsInfo: null,
        affordabilityInfo: null,
        finalResponse: null,
    });
    return result.finalResponse ?? "I could not complete the analysis. Please try again.";
}
