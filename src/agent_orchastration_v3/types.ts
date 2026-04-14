/**
 * V3 types — multi-agent LangGraph financial assistant.
 */

// ─── Intent taxonomy ─────────────────────────────────────────────────────────

export type IntentType =
  | "INFO_ONLY"
  | "AFFORDABILITY_CHECK"
  | "PLANNING"
  | "COMPARISON"
  | "ACTION_SUGGESTION";

// ─── Domain taxonomy ─────────────────────────────────────────────────────────

// Removed DomainType (retail/personal)

// ─── Reasoning level ─────────────────────────────────────────────────────────

export type ReasoningLevel = "NONE" | "LIGHT" | "HEAVY";

// ─── Affordability verdict ────────────────────────────────────────────────────

export type AffordabilityVerdict = "COMFORTABLE" | "RISKY" | "CANNOT_AFFORD";

// ─── Product suggestion reason ────────────────────────────────────────────────

export type SuggestionReason =
  | "INSUFFICIENT_FUNDS"
  | "CASHFLOW_RISK"
  | "CASHFLOW_IMPACT"
  | "USER_REQUESTED";

// ─── Financial goal context ───────────────────────────────────────────────────

// Removed FinancialGoalContext (retail/personal)

// ─── User profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  availableLiquidity: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  netMonthlySurplus?: number;
  homeCurrency: string;
  userName?: string;
}

// ─── Conversation history ─────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// ─── Socket contract ──────────────────────────────────────────────────────────

export interface ChatRequestV3 {
  userId: string;
  message: string;
  sessionId?: string;
  knownFacts?: Record<string, unknown>;
}

export interface ChatResponseV3 {
  type: "FINAL" | "FOLLOW_UP" | "ERROR";
  message: string;
  missingFacts?: string[];
}

// ─── LLM message shapes ────────────────────────────────────────────────────────

/** OpenAI-compatible message passed to every agent's LLM call */
export interface AgenticMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
