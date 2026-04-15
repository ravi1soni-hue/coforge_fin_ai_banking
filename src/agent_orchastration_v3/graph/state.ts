/**
 * Multi-agent LangGraph state.
 *
 * Flows through nodes:
 *   loadProfile → supervisor → [research?] → [affordability?] → synthesis
 *
 * Each node reads the slice of state it needs and returns only what it updates.
 */

import { Annotation } from "@langchain/langgraph";
import { UserProfile } from "../types.js";

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
  conversationalOnly: boolean;   // pure follow-up — skip research & affordability, go straight to synthesis
  product?: string;              // product name, e.g. "iPhone 16 Pro"
  searchQuery?: string;          // optimised web search query (≤8 words)
  priceCurrency?: string;        // ISO code of the price currency, e.g. "EUR"
  targetCurrency?: string;       // ISO code of the user's home currency, e.g. "GBP"
  userHomeCurrency: string;      // always set — defaults to "GBP"
  userStatedPrice?: number;      // price explicitly stated by user (0 = not stated)
  intentType: "corporate_treasury" | "unknown"
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

// ─── Treasury payment-run analysis ───────────────────────────────────────────

export interface TreasuryAnalysis {
  availableLiquidity: number;
  weeklyOutflow: number;
  expectedMidweekInflow: number;
  lateInflowEventsLast4Weeks: number;
  comfortThreshold: number;
  paymentAmount: number;
  urgentSupplierTotal: number;
  deferableSupplierTotal: number;
  projectedLowBalance: number;
  projectedLowBalanceIfFullRelease: number;
  projectedLowBalanceIfSplit: number;
  riskLevel: "SAFE" | "CAUTION" | "HIGH_RISK";
  suggestedNowAmount: number;
  suggestedLaterAmount: number;
  minInflowForMidweekRelease: number;
  releaseConditionHitRate10Weeks: number;
  currency: string;
  rationale: string;
  // Scenario-aware fields
  payrollOutflow?: number;
  payrollDay?: string;
  historicalBuffer?: number;
  observedLateInflows?: number;
  projectedLowIfLateInflow?: number;
  projectedLowIfEarlyInflow?: number;
  inflowVariance?: number;
  usedUserAmount: boolean;
}

// ─── Conversation turn (for history) ─────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// ─── LangGraph state annotation ──────────────────────────────────────────────

export const FinancialGraphState = Annotation.Root({
  // ── Inputs (set once at entry) ──────────────────────────────────────────────
  userId:      Annotation<string>,
  sessionId:   Annotation<string>,
  userMessage: Annotation<string>,
  knownFacts:  Annotation<Record<string, unknown>>,

  // ── Conversation history (loaded before graph, passed in) ───────────────────
  conversationHistory: Annotation<ConversationTurn[]>,

  // ── User profile (loaded by loadProfileNode) ────────────────────────────────
  userProfile: Annotation<UserProfile | null>,


  // ── Supervisor's plan (set by supervisorNode) ────────────────────────────────
  plan: Annotation<AgentPlan | null>,

  // ── Intent type (set by finance-decision-agent) ──────────────────────────────
  intentType: Annotation<string | null>,

  // ── Research results (set by researchNode) ──────────────────────────────────
  priceInfo:  Annotation<PriceInfo | null>,
  fxInfo:     Annotation<FxInfo | null>,
  newsInfo:   Annotation<NewsInfo | null>,

  // ── Affordability analysis (set by affordabilityNode) ──────────────────────
  affordabilityInfo: Annotation<AffordabilityInfo | null>,

  // ── Treasury analysis (optional, set before graph invoke) ───────────────────
  treasuryAnalysis: Annotation<TreasuryAnalysis | null>,

  // ── Final response (set by synthesisNode) ───────────────────────────────────
  finalResponse: Annotation<string | null>,
});

export type FinancialState = typeof FinancialGraphState.State;
