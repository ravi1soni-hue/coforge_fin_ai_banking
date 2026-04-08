/**
 * V3 types — agentic tool-calling pipeline.
 *
 * Re-uses V2 domain types (UserProfile, FinancialGoalContext, etc.) and adds
 * the OpenAI tool-calling message shapes required by V3.
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

// ─── OpenAI Tool Call shapes ───────────────────────────────────────────────────

/** A single function call the LLM wants to make */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** JSON-encoded arguments string from the API */
    arguments: string;
  };
}

// ─── Agentic message shapes ────────────────────────────────────────────────────

/** Full OpenAI-compatible message (covers all roles in the tool-calling loop) */
export interface AgenticMessage {
  role: "system" | "user" | "assistant" | "tool";
  /**
   * Text content. May be null for assistant messages that only contain
   * tool_calls (the API omits the content field in that case).
   */
  content: string | null;
  /** Present only on assistant messages that request tool invocations */
  tool_calls?: ToolCall[];
  /** Required on tool (function result) messages */
  tool_call_id?: string;
  /** Optional name field for tool messages */
  name?: string;
}

// ─── Tool call response from the LLM client ───────────────────────────────────

/** What the V3 LLM client returns per call */
export interface ToolCallingResponse {
  /** Final text content — present when the LLM has finished reasoning */
  content: string | null;
  /** Present when the LLM wants to call one or more tools */
  toolCalls?: ToolCall[];
}

// ─── Tool result (returned from executor to the pipeline) ─────────────────────

export interface ToolResult {
  /** Tool name for logging */
  toolName: string;
  /** Serialisable result placed in the tool message content */
  data: Record<string, unknown>;
}

// ─── Tool definitions (OpenAI function schema) ────────────────────────────────

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
}
