/**
 * Shared types for the V2 orchestration pipeline.
 *
 * Designed for infinite banking use-cases via intent × domain × reasoning dimensions.
 */

// ─── Intent taxonomy ─────────────────────────────────────────────────────────

/** Primary intent of a user message */
export type IntentType =
  | "INFO_ONLY"           // explanation, rates, eligibility, definitions
  | "AFFORDABILITY_CHECK" // can I afford X?
  | "PLANNING"            // how should I plan/save/invest
  | "COMPARISON"          // product A vs B
  | "ACTION_SUGGESTION";  // suggest loan/EMI/investment/etc.

// ─── Domain taxonomy ─────────────────────────────────────────────────────────

/** Financial domain of the user's query */
export type DomainType =
  | "TRAVEL"
  | "CONSUMER_PURCHASE"   // phone, bike, laptop, car
  | "HOUSING"             // rent, home loan, deposit
  | "LOAN"
  | "SAVINGS"
  | "INVESTMENT"
  | "SUBSCRIPTION"
  | "LIFESTYLE"
  | "GENERAL_BANKING";

// ─── Reasoning level ─────────────────────────────────────────────────────────

/** How much numerical reasoning the query requires */
export type ReasoningLevel =
  | "NONE"    // simple info lookup
  | "LIGHT"   // advice without heavy calculations
  | "HEAVY";  // affordability verdicts, projections, plans

// ─── Affordability verdict ────────────────────────────────────────────────────

/** Computed entirely in code from profile + goal — never by LLM */
export type AffordabilityVerdict =
  | "COMFORTABLE"   // can afford, buffer intact
  | "RISKY"         // can afford but buffer falls below safe threshold
  | "CANNOT_AFFORD" // cost exceeds available savings

// ─── Product suggestion ───────────────────────────────────────────────────────

/**
 * Why a product suggestion was triggered.
 * Only set when shouldSuggestProduct = true.
 */
export type SuggestionReason =
  | "INSUFFICIENT_FUNDS"  // verdict = CANNOT_AFFORD
  | "CASHFLOW_RISK"        // verdict = RISKY
  | "CASHFLOW_IMPACT"      // COMFORTABLE but remaining savings drops close to safe buffer threshold
  | "USER_REQUESTED";      // user explicitly asked for options/plans

// ─── Conversation stage ───────────────────────────────────────────────────────

/**
 * Granular conversation stages for the state machine.
 * Not all stages need to be visited in every flow.
 */
export type ConversationStage =
  | "GENERAL"              // no active financial flow
  | "INTENT_IDENTIFIED"    // intent classified, may need additional facts
  | "AWAITING_COST"        // waiting for monetary amount
  | "AWAITING_TIME_HORIZON"// waiting for time frame (for planning intents)
  | "ANALYSIS_IN_PROGRESS" // computation underway (reserved for async flows)
  | "VERDICT_GIVEN"        // affordability/planning verdict delivered, offered follow-on
  | "PLAN_SUGGESTED";      // follow-on plan delivered (terminal — resets to GENERAL)

// ─── Financial goal context ───────────────────────────────────────────────────

/**
 * Replaces TripContext — generalised for all financial goal types.
 * domain-specific extras go into metadata.
 */
export interface FinancialGoalContext {
  goalType: "TRIP" | "PURCHASE" | "HOUSING" | "LOAN" | "INVESTMENT" | "SAVINGS";
  cost?: number;
  currency?: string;
  timeHorizon?: string;               // e.g. "3 months", "next year", "2028"
  metadata?: Record<string, unknown>; // e.g. { destination, item, downPayment }
}

// ─── User profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  availableSavings: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  netMonthlySurplus?: number;
  homeCurrency: string;
  userName?: string;
}

// ─── Full V2 conversation state ───────────────────────────────────────────────

/** Persisted to DB between turns via ConversationStore */
export interface V2State {
  stage: ConversationStage;
  intent?: IntentType;
  domain?: DomainType;
  reasoning?: ReasoningLevel;
  goal?: FinancialGoalContext;
  lastVerdict?: AffordabilityVerdict;
  profile?: UserProfile;
}

// ─── Conversation history ─────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// ─── Socket contract ──────────────────────────────────────────────────────────

/** Input message from the socket layer */
export interface ChatRequestV2 {
  userId: string;
  message: string;
  sessionId?: string;
  /** Already-normalised facts from the banking profile seed */
  knownFacts?: Record<string, unknown>;
}

/** Response sent back to the socket layer */
export interface ChatResponseV2 {
  type: "FINAL" | "FOLLOW_UP" | "ERROR";
  message: string;
  missingFacts?: string[];
}
