/**
 * Shared types for the V2 orchestration pipeline.
 */

/** Conversation stage — tracked in DB between turns */
export type ConversationStage =
  | "GENERAL"              // No active financial flow
  | "AWAITING_AMOUNT"      // Waiting for trip/purchase cost
  | "AFFORDABILITY_DONE";  // Gave verdict, offered instalment plan

export interface TripContext {
  cost: number;
  currency: string;        // Trip/purchase currency, e.g. "EUR"
  destination?: string;
}

export interface UserProfile {
  availableSavings: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  netMonthlySurplus?: number;
  homeCurrency: string;
  userName?: string;
}

/** Full V2 conversation state persisted across turns */
export interface V2State {
  stage: ConversationStage;
  trip?: TripContext;
  profile?: UserProfile;
}

/** Input message from the socket layer */
export interface ChatRequestV2 {
  userId: string;
  message: string;
  sessionId?: string;
  /** Already-normalised facts from the banking profile seed */
  knownFacts?: Record<string, unknown>;
}

/** Response returned to the socket layer */
export interface ChatResponseV2 {
  type: "FOLLOW_UP" | "FINAL" | "ERROR";
  message: string;
  missingFacts?: string[];
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}
