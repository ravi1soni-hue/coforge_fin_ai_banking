import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

type ReasoningState = {
  queryType?: string;
  affordable?: boolean;
  affordableNextMonth?: boolean;
  shortfallAmount?: number;
  risks?: string[];
};

type CashflowSummary = {
  monthlyIncome?: number;
  monthlyExpenses?: number;
  netMonthlySavings?: number;
};

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
- Financial reasoning: ${JSON.stringify(state.reasoning ?? {}, null, 2)}

RULES FOR SUGGESTION:
1. Suggestion should be SHORT (1-2 sentences max).
2. Only suggest if it directly addresses the user's question or concern.
3. Be practical and specific (e.g., cut expenses by $X/month, increase savings by Y%).
4. Do NOT repeat the main answer.
5. Do NOT suggest if the user just asked for information (balance, investments, etc).
6. ONLY suggest if user explicitly asked for planning/help OR the financial context shows a shortfall, negative cash flow, or clear affordability risk.
7. If the user can already afford the goal comfortably and did not ask for planning advice, respond with "NO_SUGGESTION".
8. Tone must be supportive and professional, never blunt or judgmental.
9. Avoid imperative phrasing like "cut at least $X". Prefer collaborative wording such as "you could consider" or "one option is".
10. Where appropriate, mention one optional banking product path (budget planner or installment option) in a non-salesy way.
11. If suggesting two alternative paths, format explicitly as: "Option 1: ... Option 2: ...".

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
 * Returns true only when there is either:
 * - an explicit request for planning/help/action, or
 * - adverse financial context such as shortfall or negative cash flow
 */
function determineSuggestionEligibility(state: GraphStateType): boolean {
  if (!state.intent) {
    return false;
  }

  const questionLower = state.question.toLowerCase();
  const actionLower = state.intent.action.toLowerCase();

  if (isInformationalQuery(questionLower, actionLower, state)) {
    return false;
  }

  const reasoning = asReasoningState(state.reasoning);
  const cashflow = asCashflowSummary(state.financeData);
  const explicitHelpRequest = isExplicitHelpRequest(
    questionLower,
    actionLower
  );
  const affordabilityContext = hasAffordabilityContext(
    actionLower,
    state,
    reasoning
  );
  const hasShortfall =
    typeof reasoning.shortfallAmount === "number" &&
    reasoning.shortfallAmount > 0;
  const hasNegativeCashflow = hasNegativeCashflowContext(
    cashflow,
    reasoning
  );
  const hasAffordabilityRisk =
    hasShortfall ||
    hasNegativeCashflow ||
    reasoning.affordableNextMonth === false ||
    reasoning.affordable === false;

  if (explicitHelpRequest) {
    return true;
  }

  return affordabilityContext && hasAffordabilityRisk;
}

function isInformationalQuery(
  questionLower: string,
  actionLower: string,
  state: GraphStateType
): boolean {
  const knownQueryType =
    typeof state.knownFacts?.queryType === "string"
      ? state.knownFacts.queryType.toLowerCase()
      : "";

  const informationalPatterns = [
    /\bbalance\b/,
    /\baccount\b/,
    /\binvestment\b/,
    /\bprofit\b/,
    /\bloss\b/,
    /\bsubscription\b/,
    /\bstatement\b/,
    /\bcashflow\b/,
    /\bwhat do i have\b/,
    /\btell me about\b/,
  ];

  const informationalActions = [
    "balance",
    "explanation",
    "information",
    "query",
    "status",
    "conversation",
  ];

  return (
    informationalActions.some((action) => actionLower.includes(action)) ||
    knownQueryType === "investment_performance" ||
    knownQueryType === "subscriptions" ||
    knownQueryType === "bank_statement" ||
    informationalPatterns.some((pattern) => pattern.test(questionLower))
  );
}

function isExplicitHelpRequest(
  questionLower: string,
  actionLower: string
): boolean {
  const explicitPatterns = [
    /\bhow should i\b/,
    /\bhow do i\b/,
    /\bwhat should i do\b/,
    /\bhelp me\b/,
    /\bplan for\b/,
    /\bplanning\b/,
    /\bhow can i\b/,
    /\bwhat can i do\b/,
    /\badvice\b/,
    /\bsuggest\b/,
    /\brecommend\b/,
  ];

  return (
    actionLower.includes("planning") ||
    actionLower.includes("optimization") ||
    explicitPatterns.some((pattern) => pattern.test(questionLower))
  );
}

function hasAffordabilityContext(
  actionLower: string,
  state: GraphStateType,
  reasoning: ReasoningState
): boolean {
  const knownQueryType =
    typeof state.knownFacts?.queryType === "string"
      ? state.knownFacts.queryType.toLowerCase()
      : "";

  return (
    actionLower.includes("afford") ||
    actionLower.includes("decision") ||
    knownQueryType === "affordability" ||
    reasoning.queryType === "affordability"
  );
}

function hasNegativeCashflowContext(
  cashflow: CashflowSummary,
  reasoning: ReasoningState
): boolean {
  if (
    typeof cashflow.netMonthlySavings === "number" &&
    cashflow.netMonthlySavings < 0
  ) {
    return true;
  }

  if (
    typeof cashflow.monthlyIncome === "number" &&
    typeof cashflow.monthlyExpenses === "number" &&
    cashflow.monthlyExpenses > cashflow.monthlyIncome
  ) {
    return true;
  }

  return (reasoning.risks ?? []).some((risk) => {
    const normalizedRisk = risk.toLowerCase();
    return (
      normalizedRisk.includes("negative cash") ||
      normalizedRisk.includes("deficit") ||
      normalizedRisk.includes("expenses exceed income")
    );
  });
}

function asReasoningState(value: unknown): ReasoningState {
  if (!value || typeof value !== "object") {
    return {};
  }

  const reasoning = value as Record<string, unknown>;

  return {
    queryType:
      typeof reasoning.queryType === "string"
        ? reasoning.queryType.toLowerCase()
        : undefined,
    affordable:
      typeof reasoning.affordable === "boolean"
        ? reasoning.affordable
        : undefined,
    affordableNextMonth:
      typeof reasoning.affordableNextMonth === "boolean"
        ? reasoning.affordableNextMonth
        : undefined,
    shortfallAmount:
      typeof reasoning.shortfallAmount === "number"
        ? reasoning.shortfallAmount
        : undefined,
    risks: Array.isArray(reasoning.risks)
      ? reasoning.risks.filter(
          (risk): risk is string => typeof risk === "string"
        )
      : undefined,
  };
}

function asCashflowSummary(financeData: unknown): CashflowSummary {
  if (!financeData || typeof financeData !== "object") {
    return {};
  }

  const financeRecord = financeData as Record<string, unknown>;
  const cashflowSummary = financeRecord.cashflow_summary;

  if (!cashflowSummary || typeof cashflowSummary !== "object") {
    return {};
  }

  const cashflow = cashflowSummary as Record<string, unknown>;

  return {
    monthlyIncome:
      typeof cashflow.monthlyIncome === "number"
        ? cashflow.monthlyIncome
        : undefined,
    monthlyExpenses:
      typeof cashflow.monthlyExpenses === "number"
        ? cashflow.monthlyExpenses
        : undefined,
    netMonthlySavings:
      typeof cashflow.netMonthlySavings === "number"
        ? cashflow.netMonthlySavings
        : undefined,
  };
}
