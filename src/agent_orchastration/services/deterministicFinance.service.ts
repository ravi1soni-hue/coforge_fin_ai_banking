import type { GraphStateType } from "../graph/state.js";

type GenericObject = Record<string, unknown>;

export interface DeterministicSnapshot {
  currency: string;
  accounts: Array<{ type: string; balance: number }>;
  totalBalance?: number;
  investments: Array<{ type: string; currentValue: number; monthlyContribution?: number }>;
  totalInvestmentValue?: number;
  monthlyInvestmentContribution?: number;
  hasInvestmentCostBasis: boolean;
  investmentPerformance?: {
    estimatedProfitOrLoss?: number;
    estimatedReturnPct?: number;
    period: string;
    confidence?: {
      label?: string;
      score?: number;
      flags?: string[];
    };
    isComputable: boolean;
  };
  transactions: Array<{ date: string; type: "CREDIT" | "DEBIT"; amount: number }>;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  safeAnswer?: string;
}

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

const asObject = (value: unknown): GenericObject | undefined => {
  return typeof value === "object" && value !== null ? (value as GenericObject) : undefined;
};

const asObjectArray = (value: unknown): GenericObject[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is GenericObject => typeof item === "object" && item !== null);
};

const formatMoney = (value: number): string => {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const asksBalance = (question: string): boolean => {
  return /\bbalance\b|\baccount balance\b|\baccount\b/.test(question);
};

const asksInvestment = (question: string): boolean => {
  return /\binvestment\b|\bportfolio\b|\bisa\b|\bpremium bonds\b/.test(question);
};

const asksStatement = (question: string): boolean => {
  return /\bstatement\b|\bcashflow\b|\binflow\b|\boutflow\b/.test(question);
};

const asksProfit = (question: string): boolean => {
  return /\bprofit\b|\bgain\b|\breturn\b|\bpnl\b/.test(question);
};

const resolveMonth = (snapshot: DeterministicSnapshot, question: string): string | undefined => {
  const months = [...new Set(snapshot.transactions.map((tx) => tx.date.slice(0, 7)))].sort();
  if (!months.length) {
    return undefined;
  }

  if (/last month/.test(question) && months.length >= 2) {
    return months[months.length - 2];
  }

  return months[months.length - 1];
};

const formatMonth = (yyyymm: string): string => {
  const [year, month] = yyyymm.split("-").map(Number);
  const dt = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return dt.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
};

export const buildDeterministicSnapshot = (state: GraphStateType): DeterministicSnapshot => {
  const knownFacts = asObject(state.knownFacts) ?? {};
  const financeData = asObject(state.financeData) ?? {};

  const cashflow = asObject(financeData.cashflow_summary);

  const currency =
    (typeof knownFacts.currency === "string" && knownFacts.currency) ||
    (typeof cashflow?.currency === "string" && cashflow.currency) ||
    "GBP";

  const accountsFromFacts = asObjectArray(knownFacts.accounts).map((acc) => ({
    type: typeof acc.type === "string" ? acc.type : "Account",
    balance: parseNumeric(acc.balance) ?? 0,
  }));
  const accountsFromFinance = asObjectArray(financeData.accounts).map((acc) => ({
    type: typeof acc.type === "string" ? acc.type : "Account",
    balance: parseNumeric(acc.balance) ?? 0,
  }));
  const accounts = accountsFromFacts.length > 0 ? accountsFromFacts : accountsFromFinance;

  const investmentsFromFacts = asObjectArray(knownFacts.investments).map((inv) => ({
    type: typeof inv.type === "string" ? inv.type : "Investment",
    currentValue: parseNumeric(inv.currentValue) ?? 0,
    monthlyContribution: parseNumeric(inv.monthlyContribution) ?? parseNumeric(inv.monthlySip),
    costBasis: parseNumeric(inv.costBasis),
  }));

  const financeInvestments = asObject(financeData.investments);
  const investmentsFromFinance = asObjectArray(financeInvestments?.items).map((inv) => ({
    type: typeof inv.type === "string" ? inv.type : "Investment",
    currentValue: parseNumeric(inv.currentValue) ?? 0,
    monthlyContribution: parseNumeric(inv.monthlyContribution),
    costBasis: parseNumeric(inv.costBasis),
  }));

  const investmentsBase = investmentsFromFacts.length > 0 ? investmentsFromFacts : investmentsFromFinance;
  const investments = investmentsBase.map((item) => ({
    type: item.type,
    currentValue: item.currentValue,
    monthlyContribution: item.monthlyContribution,
  }));

  const hasInvestmentCostBasis = investmentsBase.some((item) => item.costBasis !== undefined);

  const marketData = asObject(financeData.marketData);
  const performance = asObject(marketData?.performance);
  const confidence = asObject(performance?.confidence);
  const investmentPerformance = performance
    ? {
        estimatedProfitOrLoss: parseNumeric(performance.estimatedProfitOrLoss),
        estimatedReturnPct: parseNumeric(performance.estimatedReturnPct),
        period: typeof performance.period === "string" ? performance.period : "observed_transaction_window",
        confidence: {
          label: typeof confidence?.label === "string" ? confidence.label : undefined,
          score: parseNumeric(confidence?.score),
          flags: Array.isArray(confidence?.flags)
            ? confidence.flags.filter((flag): flag is string => typeof flag === "string")
            : undefined,
        },
        isComputable: Boolean(performance.isComputable),
      }
    : undefined;

  const txFromFacts = asObjectArray(knownFacts.transactions);
  const txFromFinance = asObjectArray(financeData.transactions);
  const txBase = txFromFacts.length > 0 ? txFromFacts : txFromFinance;
  const transactions = txBase
    .map((tx) => {
      const date = typeof tx.date === "string" ? tx.date : "";
      const typeRaw = typeof tx.type === "string" ? tx.type.toUpperCase() : "";
      const amount = parseNumeric(tx.amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (typeRaw !== "CREDIT" && typeRaw !== "DEBIT") || amount === undefined) {
        return undefined;
      }

      return {
        date,
        type: typeRaw as "CREDIT" | "DEBIT",
        amount,
      };
    })
    .filter((tx): tx is { date: string; type: "CREDIT" | "DEBIT"; amount: number } => Boolean(tx));

  const totalBalance =
    accounts.length > 0
      ? accounts.reduce((sum, acc) => sum + acc.balance, 0)
      : parseNumeric(knownFacts.currentBalance) ?? parseNumeric(cashflow?.currentBalance);

  const totalInvestmentValue =
    investments.length > 0
      ? investments.reduce((sum, inv) => sum + inv.currentValue, 0)
      : parseNumeric(financeInvestments?.totalCurrentValue);

  const monthlyInvestmentContribution = investments.reduce(
    (sum, inv) => sum + (inv.monthlyContribution ?? 0),
    0
  );

  return {
    currency: currency.toUpperCase(),
    accounts,
    totalBalance,
    investments,
    totalInvestmentValue,
    monthlyInvestmentContribution: monthlyInvestmentContribution > 0 ? monthlyInvestmentContribution : undefined,
    hasInvestmentCostBasis: hasInvestmentCostBasis || Boolean(investmentPerformance?.isComputable),
    investmentPerformance,
    transactions,
  };
};

export const tryBuildDeterministicAnswer = (
  questionInput: string,
  snapshot: DeterministicSnapshot
): string | undefined => {
  const question = questionInput.toLowerCase();

  if (asksBalance(question) && snapshot.totalBalance !== undefined) {
    const accountParts = snapshot.accounts
      .map((account) => `${account.type}: ${snapshot.currency} ${formatMoney(account.balance)}`)
      .join(", ");

    if (accountParts) {
      return `Your account balances are ${accountParts}. Total balance is ${snapshot.currency} ${formatMoney(snapshot.totalBalance)}.`;
    }

    return `Your current total balance is ${snapshot.currency} ${formatMoney(snapshot.totalBalance)}.`;
  }

  if (asksInvestment(question) && snapshot.totalInvestmentValue !== undefined) {
    const items = snapshot.investments
      .map((item) => `${item.type}: ${snapshot.currency} ${formatMoney(item.currentValue)}`)
      .join(", ");

    if (asksProfit(question) && snapshot.investmentPerformance?.isComputable) {
      const pnl = snapshot.investmentPerformance.estimatedProfitOrLoss;
      const retPct = snapshot.investmentPerformance.estimatedReturnPct;
      const confidenceLabel = snapshot.investmentPerformance.confidence?.label ?? "low";
      const confidenceScore = snapshot.investmentPerformance.confidence?.score;
      const confidenceSummary =
        confidenceScore !== undefined
          ? `${confidenceLabel} confidence (${confidenceScore.toFixed(2)})`
          : `${confidenceLabel} confidence`;

      if (pnl !== undefined) {
        const returnText =
          retPct !== undefined ? ` (${retPct.toFixed(2)}% return)` : "";
        return `Estimated investment profit/loss over ${snapshot.investmentPerformance.period} is ${snapshot.currency} ${formatMoney(pnl)}${returnText}. Confidence: ${confidenceSummary}.`;
      }
    }

    if (asksProfit(question) && !snapshot.hasInvestmentCostBasis) {
      const contributionText =
        snapshot.monthlyInvestmentContribution !== undefined
          ? ` You currently contribute about ${snapshot.currency} ${formatMoney(snapshot.monthlyInvestmentContribution)} per month.`
          : "";

      return `I can confirm current investment value, but I cannot calculate true profit without cost basis or historical valuation data. Your current investments total ${snapshot.currency} ${formatMoney(snapshot.totalInvestmentValue)}.${contributionText}`;
    }

    if (items) {
      return `Your investments are ${items}. Total current portfolio value is ${snapshot.currency} ${formatMoney(snapshot.totalInvestmentValue)}.`;
    }

    return `Your current investment portfolio value is ${snapshot.currency} ${formatMoney(snapshot.totalInvestmentValue)}.`;
  }

  if (asksStatement(question) && snapshot.transactions.length > 0) {
    const month = resolveMonth(snapshot, question);
    if (!month) {
      return undefined;
    }

    let inflow = 0;
    let outflow = 0;
    for (const tx of snapshot.transactions) {
      if (!tx.date.startsWith(month)) {
        continue;
      }
      if (tx.type === "CREDIT") {
        inflow += tx.amount;
      } else {
        outflow += tx.amount;
      }
    }

    const net = inflow - outflow;
    return `For ${formatMonth(month)}, your total inflow was ${snapshot.currency} ${formatMoney(inflow)} and total outflow was ${snapshot.currency} ${formatMoney(outflow)}, with net cashflow ${snapshot.currency} ${formatMoney(net)}.`;
  }

  return undefined;
};

export const validateAssistantAnswer = (
  questionInput: string,
  answer: string,
  snapshot: DeterministicSnapshot
): ValidationResult => {
  const question = questionInput.toLowerCase();
  const answerLower = answer.toLowerCase();

  if (asksInvestment(question) && /\bprofit\b|\bgain\b|\breturn\b/.test(answerLower) && !snapshot.hasInvestmentCostBasis) {
    return {
      valid: false,
      reason: "profit_claim_without_cost_basis",
      safeAnswer: tryBuildDeterministicAnswer(questionInput, snapshot),
    };
  }

  if (asksBalance(question) && snapshot.totalBalance !== undefined) {
    const normalizedExpected = formatMoney(snapshot.totalBalance).replace(/,/g, "");
    const normalizedAnswer = answer.replace(/,/g, "");
    if (!normalizedAnswer.includes(normalizedExpected)) {
      return {
        valid: false,
        reason: "balance_total_mismatch",
        safeAnswer: tryBuildDeterministicAnswer(questionInput, snapshot),
      };
    }
  }

  return { valid: true };
};