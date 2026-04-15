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
import { FinancialLoader } from "../financialLoader.js";
// ─── Node factory functions ───────────────────────────────────────────────────
function makeLoadProfileNode(loader) {
    return async function loadProfileNode(state) {
        console.log("[loadProfile] userId=" + state.userId);
        const profile = await loader.loadProfile(state.userId, state.knownFacts ?? {});
        console.log("[loadProfile] name=" + (profile.userName ?? "unknown") + " liquidity=" + profile.availableLiquidity + " " + profile.homeCurrency);
        return { userProfile: profile };
    };
}
function makeSupervisorNode(llmClient, vectorQuery) {
    return async function supervisorNode(state) {
        console.log("[supervisor] Analysing query: " + state.userMessage.slice(0, 80));
        console.log("[supervisor] Conversation history:", JSON.stringify(state.conversationHistory, null, 2));
        // RAG: fetch relevant context from vector DB
        const ragContext = await vectorQuery.getContext(state.userId, state.userMessage, { topK: 6, domain: "financial_profile" });
        // LLM is the only source of intent and plan extraction
        const plan = await runSupervisorAgent(llmClient, state.userMessage, state.userProfile, state.conversationHistory ?? [], ragContext);
        console.log("[supervisor] LLM plan:", JSON.stringify(plan, null, 2));
        return { plan, intentType: plan.intentType };
    };
}
function makeResearchNode(llmClient, vectorQuery, treasuryAnalysisService) {
    return async function researchNode(state) {
        // RAG: fetch relevant context from vector DB
        const ragContext = await vectorQuery.getContext(state.userId, state.userMessage, { topK: 6, domain: "financial_profile" });
        if (state.intentType === 'corporate_treasury') {
            console.log('[research] Running treasury analysis...');
            const treasuryAnalysis = await treasuryAnalysisService.analyze(state.userId, state.userMessage, state.knownFacts ?? {});
            return { treasuryAnalysis };
        }
        // Removed: retail flow
        console.log("[research] Starting parallel research (price + FX + news)...");
        const { priceInfo, fxInfo, newsInfo } = await runResearchAgent(llmClient, state.plan, Array.isArray(ragContext) ? ragContext : [ragContext]);
        console.log("[research] Done — price=" + (priceInfo?.price ?? "none") + " " + (priceInfo?.currency ?? "") + " fx=" + (fxInfo?.rate ?? "none") + " news=" + (newsInfo?.headlines?.length ?? 0));
        return { priceInfo, fxInfo, newsInfo };
    };
}
function makeAffordabilityNode(llmClient, vectorQuery) {
    return async function affordabilityNode(state) {
        // RAG: fetch relevant context from vector DB
        const ragContext = await vectorQuery.getContext(state.userId, state.userMessage, { topK: 6, domain: "financial_profile" });
        if (state.intentType === 'corporate_treasury') {
            // Treasury queries do not use affordability agent
            console.log('[affordability] Skipping for treasury/corporate intent.');
            return {};
        }
        // Removed: retail flow
        console.log("[affordability] Running LLM analysis...");
        const affordabilityInfo = await runAffordabilityAgent(llmClient, state, Array.isArray(ragContext) ? ragContext : [ragContext]);
        console.log("[affordability] Verdict=" + affordabilityInfo.verdict + " canAfford=" + affordabilityInfo.canAfford);
        return { affordabilityInfo };
    };
}
function makeSynthesisNode(llmClient, vectorQuery) {
    return async function synthesisNode(state) {
        // RAG: fetch relevant context from vector DB
        const ragContext = await vectorQuery.getContext(state.userId, state.userMessage, { topK: 6, domain: "financial_profile" });
        console.log("[synthesis] Generating final response...");
        const finalResponse = await runSynthesisAgent(llmClient, state, Array.isArray(ragContext) ? ragContext : [ragContext]);
        return { finalResponse };
    };
}
// ─── Conditional routing ──────────────────────────────────────────────────────
function routeAfterSupervisor(state) {
    const p = state.plan;
    if (!p)
        return "synthesis";
    // Pure follow-up / continuation — skip research & affordability entirely
    if (p.conversationalOnly)
        return "synthesis";
    // Always run research first if any data-gathering is needed OR affordability/EMI is requested
    // (affordability requires a real price — never go directly to affordability without research)
    if (p.needsWebSearch || p.needsFxConversion || p.needsNews || p.needsAffordability || p.needsEmi)
        return "research";
    return "synthesis";
}
function routeAfterResearch(state) {
    // Skip affordability if no verified price was found — sending price=0 to the
    // affordability agent produces a meaningless verdict and wastes an LLM call.
    // Synthesis already handles the "price unknown" case and will ask the user.
    const hasVerifiedPrice = (state.priceInfo?.price ?? 0) > 0;
    // Run affordability for both affordability AND EMI requests — EMI needs the
    // priceInHomeCurrency anchor so synthesis doesn't have to guess the subject.
    if ((state.plan?.needsAffordability || state.plan?.needsEmi) && hasVerifiedPrice)
        return "affordability";
    return "synthesis";
}
// ─── Graph factory ────────────────────────────────────────────────────────────
export function createFinancialGraph(deps) {
    const loader = new FinancialLoader(deps.vectorQuery, deps.v3LlmClient, deps.db);
    const compiled = new StateGraph(FinancialGraphState)
        .addNode("loadProfile", makeLoadProfileNode(loader))
        .addNode("supervisor", makeSupervisorNode(deps.v3LlmClient, deps.vectorQuery))
        .addNode("research", makeResearchNode(deps.v3LlmClient, deps.vectorQuery, deps.treasuryAnalysisService))
        .addNode("affordability", makeAffordabilityNode(deps.v3LlmClient, deps.vectorQuery))
        .addNode("synthesis", makeSynthesisNode(deps.v3LlmClient, deps.vectorQuery))
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
    console.log("✅ Financial graph compiled: supervisor → research → affordability → synthesis (RAG everywhere, persistent memory ready)");
    return compiled;
}
// ─── Turn runner ──────────────────────────────────────────────────────────────
export async function runGraphTurn(graph, input) {
    const result = await graph.invoke({
        userId: input.userId,
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        conversationHistory: input.conversationHistory ?? [],
        knownFacts: input.knownFacts ?? {},
        userProfile: null,
        plan: null,
        priceInfo: null,
        fxInfo: null,
        newsInfo: null,
        affordabilityInfo: null,
        treasuryAnalysis: input.treasuryAnalysis ?? null,
        finalResponse: null,
    });
    return result.finalResponse ?? "I could not complete the analysis. Please try again.";
}
