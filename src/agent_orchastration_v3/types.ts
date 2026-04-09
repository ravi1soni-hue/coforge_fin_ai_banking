/**
 * V3 types — multi-agent LangGraph financial assistant.
 *
 * Re-uses V2 domain types and adds the LLM message shapes used by all agents.
 */

// ─── Re-export V2 domain types (unchanged) ────────────────────────────────────

export type {
  IntentType,
  DomainType,
  ReasoningLevel,
  AffordabilityVerdict,
  SuggestionReason,
  FinancialGoalContext,
  UserProfile,
  ConversationTurn,
  ChatRequestV2 as ChatRequestV3,
  ChatResponseV2 as ChatResponseV3,
} from "../agent_orchastration_v2/types.js";

// ─── LLM message shapes ────────────────────────────────────────────────────────

/** OpenAI-compatible message passed to every agent's LLM call */
export interface AgenticMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
