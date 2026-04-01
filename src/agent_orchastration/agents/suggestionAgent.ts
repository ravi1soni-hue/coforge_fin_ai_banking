import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * Intent-based suggestion agent.
 * Decides whether to include contextual suggestions based on:
 * 1. User's classified intent (domain/action)
 * 2. Available financial data
 * 3. Query type (intent action)
 */
export const suggestionAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // ✅ Determine if suggestion is contextually appropriate
  const shouldSuggest = determineSuggestionEligibility(state);

  if (!shouldSuggest) {
    // ✅ No suggestion needed for this query type
    return {
      suggestion: undefined,
      isSuggestionIncluded: false,
    };
  }

  // ✅ Generate context-aware suggestion
  const suggestion = await llm.generateText(`
You are a financial advisor providing a brief, actionable suggestion.

CONTEXT:
- User question: "${state.question}"
- User's financial intent: ${state.intent?.action || "unknown"}
- Available financial data: ${JSON.stringify(state.financeData, null, 2)}

RULES FOR SUGGESTION:
1. Suggestion should be SHORT (1-2 sentences max).
2. Only suggest if it directly addresses the user's question or concern.
3. Be practical and specific (e.g., cut expenses by $X/month, increase savings by Y%).
4. Do NOT repeat the main answer.
5. Do NOT suggest if the user just asked for information (balance, investments, etc).
6. ONLY suggest if user is facing a decision (affordability, planning, optimization).

Generate a brief, actionable suggestion or respond with "NO_SUGGESTION" if none is appropriate.
`);

  const isSuggestionEmpty = suggestion.trim() === "NO_SUGGESTION" || suggestion.trim() === "";

  return {
    suggestion: isSuggestionEmpty ? undefined : suggestion,
    isSuggestionIncluded: !isSuggestionEmpty,
  };
};

/**
 * Determines if the current query should include a contextual suggestion.
 * 
 * Returns true only for intent actions that warrant actionable advice:
 * - affordability: "Can I afford X?" → suggest savings plan
 * - planning: Multi-step financial plan
 * - optimization: Improve current situation
 * 
 * Returns false for informational queries:
 * - balance/account info
 * - investment performance
 * - subscription listing
 * - conversation/general
 */
function determineSuggestionEligibility(state: GraphStateType): boolean {
  if (!state.intent) {
    return false;
  }

  const actionLower = state.intent.action.toLowerCase();
  
  // ✅ Actions that warrant suggestions
  const suggestableActions = [
    "affordability",     // Can I afford X in Y months?
    "planning",          // How should I plan for X?
    "optimization",      // How can I save more / reach goal faster?
    "decision",          // Should I do X or Y?
  ];

  // ✅ Actions that should NOT include suggestions
  const nonSuggestableActions = [
    "balance",           // What's my balance? (just facts)
    "explanation",       // Explain X (just info)
    "information",       // Tell me about X
    "query",             // General query
    "status",            // Current status/snapshot
    "conversation",      // Casual chat
  ];

  // ✅ Explicit non-suggestable check (takes precedence)
  if (nonSuggestableActions.some(action => actionLower.includes(action))) {
    return false;
  }

  // ✅ Explicit suggestable check
  if (suggestableActions.some(action => actionLower.includes(action))) {
    return true;
  }

  // ✅ Default: no suggestion for unknown action types
  return false;
}
