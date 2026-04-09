/**
 * Multi-agent LangGraph state.
 *
 * Flows through nodes:
 *   loadProfile → supervisor → [research?] → [affordability?] → synthesis
 *
 * Each node reads the slice of state it needs and returns only what it updates.
 */

import { Annotation } from "@langchain/langgraph";

// ─── Supervisor plan ──────────────────────────────────────────────────────────

/**
 * Returned by the supervisor agent after it reads the user's query.
 * Tells every downstream node what work it needs to do.
 */
export interface AgentPlan {
  needsWebSearch: boolean;       // needs live product price from internet
  needsFxConversion: boolean;    // needs currency conversion
  needsNews: boolean;            // needs financial news context
  needsAffordability: boolean;   // needs affordability analysis
  needsEmi: boolean;             // needs installment plan options
  product?: string;              // product name, e.g. "iPhone 16 Pro"
  searchQuery?: string;          // optimised web search query (≤8 words)
  priceCurrency?: string;        // ISO code of the price currency, e.g. "EUR"
  targetCurrency?: string;       // ISO code of the user's home currency, e.g. "GBP"
  userHomeCurrency: string;      // always set — defaults to "GBP"
}

// ─── Research results ─────────────────────────────────────────────────────────

export interface PriceInfo {
  price: number;
  currency: string;
  source: "web_search" | "llm_knowledge" | "user_stated";
  confidence: "high" | "medium" | "low";
  rawContext: string;
}

export interface FxInfo {
  rate: number;
  from: string;
  to: string;
}

export interface NewsInfo {
  headlines: string[];
  context: string;
}

// ─── Affordability analysis ───────────────────────────────────────────────────

export interface AffordabilityInfo {
  verdict: "SAFE" | "BORDERLINE" | "RISKY";
  priceInHomeCurrency: number;
  canAfford: boolean;
  analysis: string;
  emiSuggested: boolean;
}

// ─── LangGraph state annotation ──────────────────────────────────────────────

export const FinancialGraphState = Annotation.Root({
  // ── Inputs (set once at entry) ──────────────────────────────────────────────
  userId:      Annotation<string>,
  sessionId:   Annotation<string>,
  userMessage: Annotation<string>,

  // ── User profile (loaded by loadProfileNode) ────────────────────────────────
  userProfile: Annotation<Record<string, unknown> | null>,

  // ── Supervisor's plan (set by supervisorNode) ────────────────────────────────
  plan: Annotation<AgentPlan | null>,

  // ── Research results (set by researchNode) ──────────────────────────────────
  priceInfo:  Annotation<PriceInfo | null>,
  fxInfo:     Annotation<FxInfo | null>,
  newsInfo:   Annotation<NewsInfo | null>,

  // ── Affordability analysis (set by affordabilityNode) ──────────────────────
  affordabilityInfo: Annotation<AffordabilityInfo | null>,

  // ── Final response (set by synthesisNode) ───────────────────────────────────
  finalResponse: Annotation<string | null>,
});

export type FinancialState = typeof FinancialGraphState.State;
