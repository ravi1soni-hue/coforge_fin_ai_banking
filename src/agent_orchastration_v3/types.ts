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

// DomainType now only supports corporate/treasury

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

// FinancialGoalContext now only supports corporate/treasury

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


export type FeedbackType = "like" | "dislike" | "correction" | "approve" | "reject" | "custom";

export interface ChatRequestV3 {
  userId: string;
  message: string;
  sessionId?: string;
  knownFacts?: Record<string, unknown>;
  feedback?: {
    type: FeedbackType;
    comment?: string;
    forMessageId?: string;
  };
}

export interface ChatResponseV3 {
  type: "FINAL" | "FOLLOW_UP" | "ERROR";
  message: string;
  missingFacts?: string[];
  feedbackId?: string;
}

// ─── LLM message shapes ────────────────────────────────────────────────────────

/** OpenAI-compatible message passed to every agent's LLM call */
export interface AgenticMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
