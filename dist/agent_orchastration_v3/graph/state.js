/**
 * Multi-agent LangGraph state.
 *
 * Flows through nodes:
 *   loadProfile → supervisor → [research?] → [affordability?] → synthesis
 *
 * Each node reads the slice of state it needs and returns only what it updates.
 */
import { Annotation } from "@langchain/langgraph";
// ─── LangGraph state annotation ──────────────────────────────────────────────
export const FinancialGraphState = Annotation.Root({
    // ── Inputs (set once at entry) ──────────────────────────────────────────────
    userId: (Annotation),
    sessionId: (Annotation),
    userMessage: (Annotation),
    knownFacts: (Annotation),
    // ── Conversation history (loaded before graph, passed in) ───────────────────
    conversationHistory: (Annotation),
    // ── User profile (loaded by loadProfileNode) ────────────────────────────────
    userProfile: (Annotation),
    // ── Supervisor's plan (set by supervisorNode) ────────────────────────────────
    plan: (Annotation),
    // ── Intent type (set by finance-decision-agent) ──────────────────────────────
    intentType: (Annotation),
    // ── Research results (set by researchNode) ──────────────────────────────────
    priceInfo: (Annotation),
    fxInfo: (Annotation),
    newsInfo: (Annotation),
    // ── Affordability analysis (set by affordabilityNode) ──────────────────────
    affordabilityInfo: (Annotation),
    // ── Treasury analysis (optional, set before graph invoke) ───────────────────
    treasuryAnalysis: (Annotation),
    // ── Final response (set by synthesisNode) ───────────────────────────────────
    finalResponse: (Annotation),
});
