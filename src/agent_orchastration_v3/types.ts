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

export type DomainType =
  | "TRAVEL"
  | "CONSUMER_PURCHASE"
  | "HOUSING"
  | "LOAN"
  | "SAVINGS"
  | "INVESTMENT"
  | "SUBSCRIPTION"
  | "LIFESTYLE"
  | "GENERAL_BANKING";

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

export interface FinancialGoalContext {
  goalType: "TRIP" | "PURCHASE" | "HOUSING" | "LOAN" | "INVESTMENT" | "SAVINGS";
  cost?: number;
  currency?: string;
  timeHorizon?: string;
  metadata?: Record<string, unknown>;
}

// ─── User profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  availableSavings: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  netMonthlySurplus?: number;
  homeCurrency: string;
  userName?: string;
  // Unified patch addition:
  accountBalance?: number;
  accounts?: any[];
  investments?: any[];
  topInvestments?: any[];
  loans?: any[];
  creditProfile?: any;
  monthlySummaries?: any[];
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
