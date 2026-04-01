import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const synthesisAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const directAnswer = buildDeterministicAnswer(state);
  if (directAnswer) {
    return {
      finalAnswer: directAnswer,
    };
  }

  const answer = await llm.generateText(`
You are a personal banking assistant having a direct one-to-one conversation with a customer.

CORE RULE: Answer exactly what the user asked. Nothing more.

How to respond based on what the user asked:

- Simple balance/account query ("what is my balance", "show my account"):
  Reply in 1-2 sentences with the balance figures from the data. That is all.

- Simple subscription query ("what subscriptions do I have"):
  List them briefly with amounts. No advice unless asked.

- Simple statement/history query:
  Give a short summary of inflow, outflow, net. No analysis essays.

- Affordability query ("can I afford X"):
  Give a direct verdict with the key numbers (cost vs savings capacity).
  If not affordable, mention the shortfall and realistic months needed.
  Optionally suggest ONE saving plan only if it genuinely helps.

- Investment query:
  Give profit/loss figure for the period asked. Brief and factual.

RULES (never break these):
- Never use sections, headings, labels, or numbered parts in your reply.
- Never write an essay when a sentence will do.
- Never suggest products unless the user is asking how to reach a goal.
- Never repeat the question back to the user.
- Never invent data. Only use what is in the inputs below.
- Speak like a human, not a report generator.
- Plain text only. No markdown, no bold, no bullets.
- Maximum 3 sentences for simple queries. Up to 6 sentences for affordability/planning queries.

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

  // ✅ LangGraph best practice: return patch only
  return {
    finalAnswer: answer,
  };
};

const buildDeterministicAnswer = (
  state: GraphStateType
): string | undefined => {
  const question = state.question.toLowerCase();
  const financeData = (state.financeData ?? {}) as Record<string, unknown>;

  const asksBalance = /\bbalance\b|\baccount balance\b|\baccount\b/.test(question);
  const asksInvestment = /\binvestment\b|\bportfolio\b/.test(question);
  const asksStatement = /\bstatement\b|\bcashflow\b|\binflow\b|\boutflow\b/.test(question);

  if (asksBalance) {
    return buildBalanceAnswer(financeData);
  }

  if (asksInvestment) {
    return buildInvestmentAnswer(financeData);
  }

  if (asksStatement) {
    return buildStatementAnswer(financeData, question);
  }

  return undefined;
};

const buildBalanceAnswer = (
  financeData: Record<string, unknown>
): string | undefined => {
  const accounts = Array.isArray(financeData.accounts)
    ? (financeData.accounts as Record<string, unknown>[])
    : [];

  if (!accounts.length) {
    return undefined;
  }

  const currency = pickCurrency(financeData);
  const accountParts = accounts
    .map((acc) => {
      const type = typeof acc.type === "string" ? acc.type : "Account";
      const balance = toNum(acc.balance);
      if (balance === undefined) {
        return undefined;
      }

      return `${type}: ${currency} ${formatMoney(balance)}`;
    })
    .filter((part): part is string => Boolean(part));

  if (!accountParts.length) {
    return undefined;
  }

  const total = accounts.reduce((sum, acc) => sum + (toNum(acc.balance) ?? 0), 0);
  return `Your account balances are ${accountParts.join(", ")}. Total balance is ${currency} ${formatMoney(total)}.`;
};

const buildInvestmentAnswer = (
  financeData: Record<string, unknown>
): string | undefined => {
  const currency = pickCurrency(financeData);
  const investments =
    asObject(financeData.investments) ?? {};
  const items = Array.isArray(investments.items)
    ? (investments.items as Record<string, unknown>[])
    : [];
  const total = toNum(investments.totalCurrentValue);

  if (!items.length && total === undefined) {
    return undefined;
  }

  const parts = items
    .map((item) => {
      const type = typeof item.type === "string" ? item.type : "Investment";
      const currentValue = toNum(item.currentValue);
      if (currentValue === undefined) {
        return undefined;
      }

      return `${type}: ${currency} ${formatMoney(currentValue)}`;
    })
    .filter((part): part is string => Boolean(part));

  const totalValue = total ?? items.reduce((sum, item) => sum + (toNum(item.currentValue) ?? 0), 0);

  if (!parts.length) {
    return `Your current investment portfolio value is ${currency} ${formatMoney(totalValue)}.`;
  }

  return `Your investments are ${parts.join(", ")}. Total current portfolio value is ${currency} ${formatMoney(totalValue)}.`;
};

const buildStatementAnswer = (
  financeData: Record<string, unknown>,
  question: string
): string | undefined => {
  const transactions = Array.isArray(financeData.transactions)
    ? (financeData.transactions as Record<string, unknown>[])
    : [];

  if (!transactions.length) {
    return undefined;
  }

  const month = resolveRequestedMonth(transactions, question);
  if (!month) {
    return undefined;
  }

  let inflow = 0;
  let outflow = 0;

  for (const tx of transactions) {
    const date = typeof tx.date === "string" ? tx.date : "";
    if (!date.startsWith(month)) {
      continue;
    }

    const amount = toNum(tx.amount) ?? 0;
    const type = typeof tx.type === "string" ? tx.type.toUpperCase() : "";
    if (type === "CREDIT") {
      inflow += amount;
    } else if (type === "DEBIT") {
      outflow += amount;
    }
  }

  const currency = pickCurrency(financeData);
  const monthLabel = formatMonth(month);
  const net = inflow - outflow;
  return `For ${monthLabel}, your total inflow was ${currency} ${formatMoney(inflow)} and total outflow was ${currency} ${formatMoney(outflow)}, with net cashflow ${currency} ${formatMoney(net)}.`;
};

const resolveRequestedMonth = (
  transactions: Record<string, unknown>[],
  question: string
): string | undefined => {
  const months = transactions
    .map((tx) => (typeof tx.date === "string" ? tx.date.slice(0, 7) : ""))
    .filter((month) => /^\d{4}-\d{2}$/.test(month));

  if (!months.length) {
    return undefined;
  }

  const sorted = [...new Set(months)].sort();
  const latest = sorted[sorted.length - 1];

  if (/last month/.test(question) && sorted.length >= 2) {
    return sorted[sorted.length - 2];
  }

  return latest;
};

const formatMonth = (yyyymm: string): string => {
  const [year, month] = yyyymm.split("-").map(Number);
  const dt = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return dt.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

const pickCurrency = (financeData: Record<string, unknown>): string => {
  const fromSummary = asObject(financeData.cashflow_summary);
  const raw =
    (typeof fromSummary?.currency === "string" && fromSummary.currency) ||
    (typeof financeData.currency === "string" && financeData.currency) ||
    "USD";
  return raw.toUpperCase();
};

const toNum = (value: unknown): number | undefined => {
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

const asObject = (
  value: unknown
): Record<string, unknown> | undefined => {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
};

const formatMoney = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
