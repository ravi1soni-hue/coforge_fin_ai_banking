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
    (researchCostSource === "user_input" || researchCostSource === "web_search") &&
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

  const verdict =
    !hasTargetCost
      ? "I can assess your affordability accurately once the target amount is provided."
      : affordableNextMonth === true || affordable === true
      ? "Yes, this looks affordable on your current monthly cashflow."
      : shortfallAmount !== undefined && shortfallAmount > 0
      ? "Not comfortably affordable next month at your current run rate."
      : "This is possible, but it needs a tighter budget to stay comfortable.";

  const evidenceParts: string[] = [];
  if (monthlyIncome !== undefined) {
    evidenceParts.push(`${formatMoney(monthlyIncome, currency)} income`);
  }
  if (monthlyExpenses !== undefined) {
    evidenceParts.push(`${formatMoney(monthlyExpenses, currency)} expenses`);
  }
  if (netMonthlySavings !== undefined) {
    evidenceParts.push(`${formatMoney(netMonthlySavings, currency)} free cash`);
  }

  const lines: string[] = [verdict];

  if (evidenceParts.length > 0) {
    lines.push(`Based on your ${evidenceParts.join(", ")} each month.`);
  }

  if (estimatedCost === undefined) {
    lines.push(
      "I need the target purchase amount to give a reliable affordability verdict without guessing."
    );
    lines.push(
      "Share the expected cost or your budget, and I will compute exact shortfall and timeline from your real cashflow."
    );
    return lines.join(" ");
  }

  if (comparableCosts.length >= 2) {
    const minCost = Math.min(...comparableCosts);
    const maxCost = Math.max(...comparableCosts);
    lines.push(
      `A realistic budget range is around ${formatMoney(minCost, currency)} to ${formatMoney(maxCost, currency)}.`
    );
  } else if (estimatedCost !== undefined) {
    const costSourceNote =
      researchCostSource === "web_search" ? " (sourced via live search)" : "";
    lines.push(
      `Estimated total cost is about ${formatMoney(estimatedCost, currency)}${costSourceNote}.`
    );
  }

  if (shortfallAmount !== undefined && shortfallAmount > 0) {
    const monthText =
      monthsToTarget !== undefined && monthsToTarget > 0
        ? `, which likely needs around ${Math.ceil(monthsToTarget)} month(s) at your current savings pace`
        : "";
    lines.push(
      `You are short by about ${formatMoney(shortfallAmount, currency)}${monthText}.`
    );
    lines.push("Want me to build a lean month-by-month savings plan to close that gap?");
  } else if (
    projectedNextMonthSavings !== undefined &&
    estimatedCost !== undefined &&
    projectedNextMonthSavings > estimatedCost
  ) {
    lines.push(
      `You should still have around ${formatMoney(projectedNextMonthSavings - estimatedCost, currency)} buffer after funding this.`
    );
  }

  return lines.join(" ");
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
      finalResponse = `${reasoningEngineAffordabilityAnswer} ${state.suggestion}`;
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

