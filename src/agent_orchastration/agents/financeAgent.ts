import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import { RunnableConfig } from "@langchain/core/runnables";

const ALLOWED_FINANCIAL_FACETS = [
  "income",
  "expenses",
  "savings",
  "loans",
  "credit",
  "investments",
  "assets",
  "liabilities",
  "subscriptions",
  "cashflow_summary",
] as const;

type FinancialFacet = typeof ALLOWED_FINANCIAL_FACETS[number];

export const financeAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  const vectorQueryService =
    config.configurable?.vectorQueryService as VectorQueryService;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }
  if (!vectorQueryService) {
    throw new Error("VectorQueryService not provided to graph");
  }

  const knownFacts = state.knownFacts ?? {};

  // ✅ Fast path: rich banking profile provided — skip vector retrieval entirely
  // knownFacts.hasBankingProfile is set by ChatService when the client sends
  // a full userProfile/accounts/loans/subscriptions/investments/transactions payload.
  if (knownFacts.hasBankingProfile === true) {
    return {
      financeData: buildFinanceDataFromProfile(knownFacts),
    };
  }

  // ✅ Fallback path: no rich profile — use vector RAG

  // Step 1: Decide what financial data is needed
  const facetDecision = await llm.generateJSON<{
    requiredFacets: FinancialFacet[];
  }>(`
You are a financial data planning agent.

User intent:
${JSON.stringify(state.intent)}

User question:
"${state.question}"

Task:
Decide which financial data facets are REQUIRED to answer the user's question.

Allowed facets:
${JSON.stringify(ALLOWED_FINANCIAL_FACETS)}

Rules:
- Choose only from the allowed list.
- Return the MINIMAL required set.
- If the question is generic, return ["cashflow_summary"].
- Return ONLY valid JSON.

Return format:
{
  "requiredFacets": string[]
}
`);

  const facetsToExtract =
    facetDecision.requiredFacets.filter(
      (f): f is FinancialFacet =>
        ALLOWED_FINANCIAL_FACETS.includes(f)
    ) ?? ["cashflow_summary"];

  // Step 2: Fetch RAG financial context
  const context = await vectorQueryService.getContext(
    `complete financial data for user ${state.userId}`,
    { topK: 8 }
  );

  // Step 3: Extract only the required facets from vector context
  const vectorFinanceData = await llm.generateJSON<Record<string, unknown>>(`
Extract ONLY the specified financial facets from the context below.

Requested facets:
${JSON.stringify(facetsToExtract)}

Context:
${context}

Rules:
- Do NOT invent values.
- If a facet is missing, return null.
- Keep structure simple.

Return ONLY valid JSON in this shape:
{
${facetsToExtract.map(f => `  "${f}": object | number | null`).join(",\n")}
}
`);

  // Step 4: Merge — knownFacts-derived values win over vector-retrieved values
  const fallbackFinanceData = buildFallbackFinanceData(knownFacts);

  return {
    financeData: {
      ...vectorFinanceData,
      ...fallbackFinanceData,
      cashflow_summary: {
        ...((vectorFinanceData.cashflow_summary as Record<string, unknown>) ?? {}),
        ...(fallbackFinanceData.cashflow_summary as Record<string, unknown>),
      },
    },
  };
};

/**
 * Build structured financeData directly from a rich banking profile
 * that was normalised by ChatService.normalizeKnownFactsPayload().
 * This bypasses vector retrieval so user-provided figures are never
 * overwritten by stale embedded documents.
 */
const buildFinanceDataFromProfile = (
  knownFacts: Record<string, unknown>
): Record<string, unknown> => {
  const toNum = parseNumeric;

  const monthlyIncome  = toNum(knownFacts.monthlyIncome);
  const monthlyExpenses = toNum(knownFacts.monthlyExpenses);
  const netMonthlySavings = toNum(knownFacts.netMonthlySavings)
    ?? (monthlyIncome !== undefined && monthlyExpenses !== undefined
      ? monthlyIncome - monthlyExpenses
      : undefined);
  const currentBalance = toNum(knownFacts.currentBalance);
  const availableSavings = toNum(knownFacts.availableSavings);
  const currency = typeof knownFacts.currency === "string"
    ? knownFacts.currency
    : "USD";

  // Accounts — keep full list for synthesis
  const rawAccounts = Array.isArray(knownFacts.accounts)
    ? (knownFacts.accounts as Record<string, unknown>[])
    : [];

  const accounts = rawAccounts.map((acc) => ({
    accountId: acc.accountId,
    type: acc.type,
    balance: toNum(acc.balance),
    averageMonthlyBalance: toNum(acc.averageMonthlyBalance),
  }));

  // Loans
  const rawLoans = Array.isArray(knownFacts.loans)
    ? (knownFacts.loans as Record<string, unknown>[])
    : [];
  const loans = rawLoans.map((loan) => ({
    loanId: loan.loanId,
    type: loan.type,
    emi: toNum(loan.emi),
    remainingTenureMonths: toNum(loan.remainingTenureMonths),
  }));
  const totalMonthlyEmi = toNum(knownFacts.monthlyLoanEmi)
    ?? loans.reduce((s, l) => s + (l.emi ?? 0), 0);

  // Subscriptions
  const rawSubs = Array.isArray(knownFacts.subscriptions)
    ? (knownFacts.subscriptions as Record<string, unknown>[])
    : [];
  const subscriptions = rawSubs.map((sub) => ({
    name: sub.name,
    amount: toNum(sub.amount),
    cycle: sub.cycle,
  }));
  const totalMonthlySubscriptions =
    toNum(knownFacts.monthlySubscriptionSpend)
    ?? subscriptions.reduce((s, sub) => s + (sub.amount ?? 0), 0);

  // Investments — expose current values, NOT profits (avoid hallucination)
  const rawInvestments = Array.isArray(knownFacts.investments)
    ? (knownFacts.investments as Record<string, unknown>[])
    : [];
  const investments = rawInvestments.map((inv) => ({
    type: inv.type,
    currentValue: toNum(inv.currentValue),
    monthlyContribution:
      toNum(inv.monthlySip) ?? toNum(inv.monthlyContribution),
  }));
  const totalInvestmentValue = investments.reduce(
    (s, inv) => s + (inv.currentValue ?? 0),
    0
  );

  // Savings goals
  const rawGoals = Array.isArray(knownFacts.savingsGoals)
    ? (knownFacts.savingsGoals as Record<string, unknown>[])
    : [];
  const savingsGoals = rawGoals.map((goal) => ({
    goalId: goal.goalId,
    targetAmount: toNum(goal.targetAmount),
    currentSaved: toNum(goal.currentSaved),
    targetDate: goal.targetDate,
    status: goal.status,
  }));

  return {
    cashflow_summary: {
      currency,
      monthlyIncome,
      monthlyExpenses,
      netMonthlySavings,
      currentBalance,
      availableSavings,
      totalMonthlyEmi,
      totalMonthlySubscriptions,
    },
    income: {
      monthly: monthlyIncome,
      currency,
    },
    expenses: {
      monthly: monthlyExpenses,
      monthlyLoanEmi: totalMonthlyEmi,
      monthlySubscriptions: totalMonthlySubscriptions,
      currency,
    },
    savings: {
      currentBalance,
      availableSavings,
      currency,
    },
    accounts,
    loans,
    subscriptions,
    investments: {
      items: investments,
      totalCurrentValue: totalInvestmentValue,
      currency,
      note: "currentValue is the present portfolio value, NOT profit. Do not describe currentValue as profit.",
    },
    savingsGoals,
  };
};

const parseNumeric = (
  value: unknown
): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/[,\s]/g, "")
      .replace(/[^\d.-]/g, "");

    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const buildFallbackFinanceData = (
  knownFacts: Record<string, unknown>
): Record<string, unknown> => {
  const monthlyIncome = parseNumeric(
    knownFacts.monthlyIncome ?? knownFacts.monthlyNetIncome
  );
  const monthlyExpenses = parseNumeric(
    knownFacts.monthlyExpenses ?? knownFacts.monthlyCommittedExpenses
  );
  const currentBalance = parseNumeric(
    knownFacts.currentBalance ?? knownFacts.availableSavings
  );
  const explicitNetSavings = parseNumeric(
    knownFacts.netMonthlySavings
  );

  const netMonthlySavings =
    explicitNetSavings ??
    (monthlyIncome !== undefined && monthlyExpenses !== undefined
      ? monthlyIncome - monthlyExpenses
      : undefined);

  return {
    ...(monthlyIncome !== undefined
      ? { income: { monthly: monthlyIncome } }
      : {}),
    ...(monthlyExpenses !== undefined
      ? { expenses: { monthly: monthlyExpenses } }
      : {}),
    ...(currentBalance !== undefined
      ? { savings: { currentBalance } }
      : {}),
    cashflow_summary: {
      ...(monthlyIncome !== undefined ? { monthlyIncome } : {}),
      ...(monthlyExpenses !== undefined
        ? { monthlyExpenses }
        : {}),
      ...(netMonthlySavings !== undefined
        ? { netMonthlySavings }
        : {}),
      ...(currentBalance !== undefined
        ? { currentBalance }
        : {}),
      ...(typeof knownFacts.currency === "string"
        ? { currency: knownFacts.currency }
        : {}),
    },
  };
};