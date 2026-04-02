import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";
import {
  buildDeterministicSnapshot,
  tryBuildDeterministicAnswer,
  validateAssistantAnswer,
} from "../services/deterministicFinance.service.js";

const parseNumeric = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[\s,]/g, "").replace(/[^\d.-]/g, "");
    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const isPositiveNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeCurrency = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "GBP";
  }

  return value.trim().toUpperCase();
};

const formatMoney = (value: number, currency: string): string => {
  const safeCurrency = normalizeCurrency(currency);

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${safeCurrency} ${value.toLocaleString("en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
};

const isAffordabilityQuestion = (state: GraphStateType): boolean => {
  const question = state.question.toLowerCase();
  const knownQueryType =
    typeof state.knownFacts?.queryType === "string"
      ? state.knownFacts.queryType.toLowerCase()
      : "";
  const intentAction =
    typeof state.intent?.action === "string"
      ? state.intent.action.toLowerCase()
      : "";
  const reasoningQueryType =
    typeof (state.reasoning as Record<string, unknown> | undefined)?.queryType === "string"
      ? String((state.reasoning as Record<string, unknown>).queryType).toLowerCase()
      : "";

  return (
    knownQueryType === "affordability" ||
    reasoningQueryType === "affordability" ||
    intentAction.includes("afford") ||
    intentAction.includes("planning") ||
    /\bcan i afford\b|\bafford\b|\bbudget\b|\btrip\b|\bholiday\b|\bvacation\b/.test(question)
  );
};

const normalizeSuggestionOptions = (suggestion: string): string => {
  const normalized = suggestion.trim();
  if (!normalized) {
    return normalized;
  }

  // Keep explicit option formatting if already present, but normalize into multi-line layout.
  if (/option\s*1\s*:/i.test(normalized) || /option\s*2\s*:/i.test(normalized)) {
    const opt1Match = normalized.match(/option\s*1\s*:\s*(.*?)(?=option\s*2\s*:|$)/i);
    const opt2Match = normalized.match(/option\s*2\s*:\s*(.*)$/i);

    if (opt1Match?.[1] && opt2Match?.[1]) {
      const option1 = opt1Match[1].trim().replace(/[.!?]+$/, "");
      const option2 = opt2Match[1].trim().replace(/[.!?]+$/, "");
      return `Your options:\n1. ${option1}.\n2. ${option2}.`;
    }

    return normalized;
  }

  // If the model merged two choices with "or", split into explicit options.
  const splitOnOr = normalized.match(/^(.*?),\s*or\s+(.*)$/i);
  if (splitOnOr?.[1] && splitOnOr?.[2]) {
    const first = splitOnOr[1].replace(/\.$/, "").trim();
    const second = splitOnOr[2].replace(/\.$/, "").trim();

    if (first && second) {
      return `Your options:\n1. ${first}.\n2. ${second}.`;
    }
  }

  return normalized;
};

const getProductRecommendationSection = (
  state: GraphStateType,
  forAffordability: boolean
): string | undefined => {
  if (!forAffordability || !Array.isArray(state.productRecommendations)) {
    return undefined;
  }

  const top = state.productRecommendations
    .filter((item) => typeof item?.suitabilityScore === "number")
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)[0];

  if (!top || top.suitabilityScore < 0.5) {
    return undefined;
  }

  const sections: string[] = [];

  // Product name + rationale
  const productName = (top.productName ?? "").trim();
  const rationale = (top.rationale ?? "").trim();
  if (productName) {
    sections.push(
      rationale
        ? `💳 ${productName}: ${rationale}`
        : `💳 ${productName}`
    );
  }

  // Next step (actionable)
  const nextStep = (top.nextStep ?? "").trim().replace(/[.!?]+$/, "");
  if (nextStep) {
    sections.push(`Next step: ${nextStep}.`);
  }

  return sections.length > 0 ? sections.join("\n") : undefined;
};

const buildAffordabilityReasoningAnswer = (
  state: GraphStateType
): string | undefined => {
  if (!isAffordabilityQuestion(state)) {
    return undefined;
  }

  const financeData =
    state.financeData && typeof state.financeData === "object"
      ? (state.financeData as Record<string, unknown>)
      : {};
  const cashflow =
    financeData.cashflow_summary && typeof financeData.cashflow_summary === "object"
      ? (financeData.cashflow_summary as Record<string, unknown>)
      : {};
  const reasoning =
    state.reasoning && typeof state.reasoning === "object"
      ? (state.reasoning as Record<string, unknown>)
      : {};
  const researchData =
    state.researchData && typeof state.researchData === "object"
      ? (state.researchData as Record<string, unknown>)
      : {};
  const costsData =
    researchData.costs && typeof researchData.costs === "object"
      ? (researchData.costs as Record<string, unknown>)
      : {};

  const currency = normalizeCurrency(
    cashflow.currency ??
      (researchData.costs as Record<string, unknown> | undefined)?.currency ??
      state.knownFacts?.currency
  );

  const monthlyIncome = parseNumeric(cashflow.monthlyIncome);
  const monthlyExpenses = parseNumeric(cashflow.monthlyExpenses);
  const netMonthlySavings =
    parseNumeric(cashflow.netMonthlySavings) ??
    (monthlyIncome !== undefined && monthlyExpenses !== undefined
      ? monthlyIncome - monthlyExpenses
      : undefined);
  const knownFactTarget = parseNumeric(state.knownFacts?.targetAmount ?? state.knownFacts?.budget);
  const researchCostSource =
    typeof costsData.source === "string" ? costsData.source.toLowerCase() : "";
  const researchCost = parseNumeric(costsData.total);
  const trustedResearchCost =
    (researchCostSource === "user_input" ||
      researchCostSource === "web_search" ||
      researchCostSource === "unverified") &&
    isPositiveNumber(researchCost)
      ? researchCost
      : undefined;
  const estimatedCostRaw = knownFactTarget ?? trustedResearchCost;
  const estimatedCost = isPositiveNumber(estimatedCostRaw)
    ? estimatedCostRaw
    : undefined;
  const projectedNextMonthSavings = parseNumeric(reasoning.projectedNextMonthSavings);
  const shortfallAmount = parseNumeric(reasoning.shortfallAmount);
  const monthsToTarget = parseNumeric(reasoning.monthsToTargetAtCurrentSavingsRate);
  const affordableNextMonth =
    typeof reasoning.affordableNextMonth === "boolean"
      ? reasoning.affordableNextMonth
      : undefined;
  const affordable =
    typeof reasoning.affordable === "boolean" ? reasoning.affordable : undefined;
  const keyMetrics = Array.isArray(reasoning.keyMetrics)
    ? (reasoning.keyMetrics as Array<{ label: string; value: string | number }>)
    : [];
  const risks = Array.isArray(reasoning.risks) ? (reasoning.risks as string[]) : [];
  const confidence =
    typeof reasoning.confidence === "number" ? reasoning.confidence : undefined;

  const alternativesRaw = Array.isArray(researchData.alternatives)
    ? (researchData.alternatives as Array<Record<string, unknown>>)
    : [];
  const alternativeTotals = alternativesRaw
    .map((alt) => {
      const costs = alt.costs;
      if (!costs || typeof costs !== "object") {
        return undefined;
      }
      const value = parseNumeric((costs as Record<string, unknown>).total);
      return isPositiveNumber(value) ? value : undefined;
    })
    .filter((value): value is number => value !== undefined);
  const comparableCosts = [
    ...(estimatedCost !== undefined ? [estimatedCost] : []),
    ...alternativeTotals,
  ];

  const hasTargetCost = estimatedCost !== undefined;
  const hasNegativeCashflow =
    (typeof netMonthlySavings === "number" && netMonthlySavings < 0) ||
    (typeof monthlyIncome === "number" &&
      typeof monthlyExpenses === "number" &&
      monthlyExpenses > monthlyIncome);
  const hasDeterministicCoverage =
    isPositiveNumber(estimatedCost) &&
    typeof projectedNextMonthSavings === "number";
  const deterministicallyAffordableNextMonth =
    hasDeterministicCoverage && projectedNextMonthSavings >= estimatedCost;

  const goalType =
    typeof state.knownFacts?.goalType === "string" ? state.knownFacts.goalType.toLowerCase() : "";
  const purchaseLabel = (() => {
    if (goalType === "electronics") return "this purchase";
    if (goalType === "trip" || goalType === "vacation" || goalType === "holiday") return "this trip";
    if (goalType === "house" || goalType === "mortgage") return "this property goal";
    if (goalType === "car") return "this car purchase";
    return "this";
  })();

  const verdict =
    !hasTargetCost
      ? `I can assess affordability for ${purchaseLabel} accurately once the target amount is provided.`
      : hasNegativeCashflow
      ? `${purchaseLabel.charAt(0).toUpperCase() + purchaseLabel.slice(1)} is within reach, but it needs careful planning — your monthly cashflow is currently negative.`
      : hasDeterministicCoverage && !deterministicallyAffordableNextMonth
      ? `${purchaseLabel.charAt(0).toUpperCase() + purchaseLabel.slice(1)} is not comfortably affordable next month at your current run rate.`
      : affordableNextMonth === true || affordable === true
      ? `Good news — ${purchaseLabel} looks affordable on your current monthly cashflow.`
      : shortfallAmount !== undefined && shortfallAmount > 0
      ? `${purchaseLabel.charAt(0).toUpperCase() + purchaseLabel.slice(1)} is not comfortably affordable next month at your current run rate.`
      : `${purchaseLabel.charAt(0).toUpperCase() + purchaseLabel.slice(1)} is possible, but it needs a tighter budget to stay comfortable.`;

  const sections: string[] = [];

  if (estimatedCost === undefined) {
    return [
      `I can assess affordability for ${purchaseLabel} accurately once the target amount is provided.`,
      "Share the expected cost or your budget, and I will compute exact shortfall and timeline from your real cashflow."
    ].join("\n\n");
  }

  // 📊 Build reasoning-forward response (show work, not just verdict)
  const reasoningParts: string[] = [];

  // 1. Show the calculation foundation
  if (monthlyIncome !== undefined && monthlyExpenses !== undefined) {
    const targetMonth = state.knownFacts?.targetMonth || "next month";
    reasoningParts.push(
      `Based on your ${formatMoney(monthlyIncome, currency)} salary, ${formatMoney(monthlyExpenses, currency)} fixed costs and typical spending, you'll have around ${formatMoney(netMonthlySavings ?? 0, currency)} free in ${targetMonth}.`
    );
  }

  // 2. Show cost context with alternatives
  if (comparableCosts.length >= 2) {
    const minCost = Math.min(...comparableCosts);
    const maxCost = Math.max(...comparableCosts);
    const goalLabel = goalType === "trip" || goalType === "vacation" || goalType === "holiday" ? "trip" : "option";
    reasoningParts.push(
      `A budget ${goalLabel} fits in the ${formatMoney(minCost, currency)}–${formatMoney(maxCost, currency)} range.`
    );
  } else if (estimatedCost !== undefined) {
    const costSourceNote =
      researchCostSource === "web_search"
        ? " (sourced via live search)"
        : researchCostSource === "unverified"
        ? " (market estimate — confirm price before purchase)"
        : "";
    reasoningParts.push(
      `A practical cost to plan for is about ${formatMoney(estimatedCost, currency)}${costSourceNote}.`
    );
  }

  // 3. Show affordability verdict
  if (shortfallAmount !== undefined && shortfallAmount > 0) {
    const monthText =
      monthsToTarget !== undefined && monthsToTarget > 0
        ? ` You'll need around ${Math.ceil(monthsToTarget)} months at your current savings pace to close the ${formatMoney(shortfallAmount, currency)} gap.`
        : ` You're short by about ${formatMoney(shortfallAmount, currency)}.`;
    reasoningParts.push(`This needs careful planning.${monthText}`);
  } else if (affordableNextMonth === true || affordable === true) {
    if (
      projectedNextMonthSavings !== undefined &&
      estimatedCost !== undefined &&
      projectedNextMonthSavings > estimatedCost
    ) {
      const remainingSavings = projectedNextMonthSavings - estimatedCost;
      reasoningParts.push(
        `This looks affordable. You'd have around ${formatMoney(remainingSavings, currency)} buffer remaining.`
      );
    } else {
      reasoningParts.push(`Good news — ${purchaseLabel} looks affordable on your current monthly cashflow.`);
    }
  } else {
    reasoningParts.push(`${purchaseLabel.charAt(0).toUpperCase() + purchaseLabel.slice(1)} is possible, but needs a tighter budget to stay comfortable.`);
  }

  // Join all parts into a single narrative paragraph
  sections.push(reasoningParts.join(" "));

  // 4. Add actionable next step if there's a shortfall
  if (shortfallAmount !== undefined && shortfallAmount > 0) {
    sections.push("Want me to build a lean month-by-month savings plan to close that gap?");
  } else if (risks.length > 0) {
    const topRisk = risks[0];
    sections.push(`One thing to watch: ${topRisk}`);
  }

  return sections.join("\n\n");
};

export const synthesisAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const snapshot = buildDeterministicSnapshot(state);
  const reasoningEngineAffordabilityAnswer = buildAffordabilityReasoningAnswer(state);
  if (reasoningEngineAffordabilityAnswer) {
    let finalResponse = reasoningEngineAffordabilityAnswer;

    // Always include product recommendation section (enhanced version)
    const productRecommendation = getProductRecommendationSection(state, true);
    if (productRecommendation) {
      finalResponse = `${finalResponse}\n\n${productRecommendation}`;
    }

    if (
      state.isSuggestionIncluded &&
      state.suggestion &&
      !/need the target purchase amount|target amount is provided/i.test(
        reasoningEngineAffordabilityAnswer
      ) &&
      !/want me to build|month-by-month savings plan/i.test(
        reasoningEngineAffordabilityAnswer
      )
    ) {
      const normalizedSuggestion = normalizeSuggestionOptions(state.suggestion);
      finalResponse = `${finalResponse}\n\n${normalizedSuggestion}`;
    }

    return {
      finalAnswer: finalResponse,
    };
  }

  const directAnswer = tryBuildDeterministicAnswer(state.question, snapshot);
  if (directAnswer) {
    return {
      finalAnswer: directAnswer,
    };
  }

  const answer = await llm.generateText(`
You are a financial reasoning engine for personal banking.

CORE RULE: Give a concrete verdict backed by numbers from the provided data.

How to respond based on what the user asked:

- Simple balance/account query ("what is my balance", "show my account"):
  Reply in 1-2 sentences with the balance figures from the data. That is all.

- Simple subscription query ("what subscriptions do I have"):
  List them briefly with amounts. No advice unless asked.

- Simple statement/history query:
  Give a short summary of inflow, outflow, net. No analysis essays.

- Affordability query ("can I afford X"):
  Give a direct verdict, cite monthly cashflow and estimated cost, and state shortfall/timeline if relevant.

- Investment query:
  Give profit/loss figure for the period asked. Brief and factual.

RULES (never break these):
- Use 2-5 sentences and keep each sentence information-dense.
- Never write an essay when a sentence will do.
- Never suggest products unless the user is asking how to reach a goal.
- Never repeat the question back to the user.
- Never invent data. Only use what is in the inputs below.
- Speak like a confident analyst, not a casual chatbot.
- Plain text only. No markdown, no bold, no bullets.
- Include at least two concrete numbers when available.

User question:
"${state.question}"

Financial data (use only what is relevant to the question):
${JSON.stringify(state.financeData, null, 2)}

Research output:
${JSON.stringify(state.researchData, null, 2)}

Reasoning output:
${JSON.stringify(state.reasoning, null, 2)}

Product recommendation (use only if user is asking for a plan):
${JSON.stringify(state.productRecommendations ?? [], null, 2)}
`);

  const validation = validateAssistantAnswer(state.question, answer, snapshot);
  if (!validation.valid) {
    return {
      finalAnswer:
        validation.safeAnswer ??
        "I want to avoid giving you an inaccurate number. Please share the specific period and source values to confirm this precisely.",
    };
  }

  // ✅ Append suggestion if it was generated and is contextually appropriate
  let finalResponse = answer;
  if (state.isSuggestionIncluded && state.suggestion) {
    finalResponse = `${answer} ${state.suggestion}`;
  }

  // ✅ LangGraph best practice: return patch only
  return {
    finalAnswer: finalResponse,
  };
};

