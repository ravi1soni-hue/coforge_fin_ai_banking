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

  const reasoning = state.reasoning as Record<string, unknown> | undefined;
  const hasRisk =
    (typeof (reasoning as Record<string, unknown> | undefined)?.shortfallAmount === "number" &&
      ((reasoning as Record<string, unknown>).shortfallAmount as number) > 0) ||
    (typeof (reasoning as Record<string, unknown> | undefined)?.affordable === "boolean" &&
      !(reasoning as Record<string, unknown>).affordable) ||
    (typeof (reasoning as Record<string, unknown> | undefined)?.affordableNextMonth === "boolean" &&
      !(reasoning as Record<string, unknown>).affordableNextMonth);
  const cashflow = state.financeData as Record<string, unknown> | undefined;
  const cashflowSummary = (cashflow?.cashflow_summary ?? {}) as Record<string, unknown>;
  const netSavings =
    typeof cashflowSummary.netMonthlySavings === "number"
      ? cashflowSummary.netMonthlySavings
      : undefined;
  const hasNegativeCashflow = typeof netSavings === "number" && netSavings < 0;
  const mustShowTwoOptions = hasRisk || hasNegativeCashflow;

  const topProduct =
    Array.isArray(state.productRecommendations) && state.productRecommendations.length > 0
      ? state.productRecommendations.sort(
          (a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0)
        )[0]
      : null;
  const productHint = topProduct
    ? `Recommended product: ${topProduct.productName} — ${topProduct.rationale} (next step: ${topProduct.nextStep})`
    : "No specific product identified.";

  // ✅ Generate context-aware suggestion
  const suggestion = await llm.generateText(`
You are a financial advisor providing a brief, actionable suggestion.

CONTEXT:
- User question: "${state.question}"
- User's financial intent: ${state.intent?.action || "unknown"}
- Available financial data: ${JSON.stringify(state.financeData, null, 2)}
- Financial reasoning: ${JSON.stringify(state.reasoning ?? {}, null, 2)}
- Recommended banking product: ${productHint}

RULES FOR SUGGESTION:
1. Do NOT repeat the main answer or re-state the verdict.
2. Be practical and specific — tie advice directly to the user's situation.
3. Avoid imperative phrasing like "cut at least $X". Prefer "you could consider" or "one option is".
4. Tone must be supportive and professional, never blunt or judgmental.
5. Do NOT suggest if the user just asked for information (balance, investments, etc).
6. If the user can already afford the goal comfortably, respond with "NO_SUGGESTION".
${mustShowTwoOptions
  ? `7. REQUIRED: Because there is a cashflow risk or shortfall, you MUST provide exactly two options.
   - Format: "Option 1: [savings/timing path]. Option 2: [banking product path using the recommended product above]."
   - Option 1: a practical spending or timing adjustment the user can act on immediately.
   - Option 2: reference the recommended banking product as a support path in a helpful, non-salesy way.
   - Both options should be 1 sentence each.`
  : `7. Provide a single concise suggestion (1-2 sentences).`
}

Generate the suggestion or respond with "NO_SUGGESTION" if none is appropriate.
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
