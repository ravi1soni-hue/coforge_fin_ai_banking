import { buildDeterministicSnapshot } from "../services/deterministicFinance.service.js";
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
];
export const financeAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    const vectorQueryService = config.configurable?.vectorQueryService;
    const marketDataService = config.configurable?.marketDataService;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    if (!vectorQueryService) {
        throw new Error("VectorQueryService not provided to graph");
    }
    const knownFacts = state.knownFacts ?? {};
    // Step 1: Decide what financial data is needed
    const facetDecision = await llm.generateJSON(`
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
    const facetsToExtract = facetDecision.requiredFacets.filter((f) => ALLOWED_FINANCIAL_FACETS.includes(f)) ?? ["cashflow_summary"];
    // Step 2: Fetch RAG financial context
    const context = await vectorQueryService.getContext(`financial data for user ${state.userId}. Question: ${state.question}`, {
        topK: 8,
        filter: (doc) => doc.metadata?.userId === state.userId,
    });
    // Step 3: Extract only the required facets from vector context
    const vectorFinanceData = await llm.generateJSON(`
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
    const profileFinanceData = buildFinanceDataFromProfile(knownFacts);
    const mergedFinanceData = {
        ...vectorFinanceData,
        ...profileFinanceData,
        ...fallbackFinanceData,
        cashflow_summary: {
            ...(vectorFinanceData.cashflow_summary ?? {}),
            ...fallbackFinanceData.cashflow_summary,
        },
    };
    const userCurrency = typeof mergedFinanceData.cashflow_summary?.currency === "string"
        ? String(mergedFinanceData.cashflow_summary.currency)
        : "GBP";
    const marketInvestments = Array.isArray(mergedFinanceData.investments?.items)
        ? mergedFinanceData.investments.items.map((item) => ({
            type: typeof item.type === "string" ? item.type : "Investment",
            currentValue: parseNumeric(item.currentValue) ?? 0,
            monthlyContribution: parseNumeric(item.monthlyContribution),
        }))
        : [];
    const marketTransactions = Array.isArray(mergedFinanceData.transactions)
        ? mergedFinanceData.transactions.reduce((acc, tx) => {
            const date = typeof tx.date === "string" ? tx.date : undefined;
            const type = typeof tx.type === "string" ? tx.type.toUpperCase() : undefined;
            const amount = parseNumeric(tx.amount);
            if (!date || (type !== "CREDIT" && type !== "DEBIT") || amount === undefined) {
                return acc;
            }
            acc.push({
                date,
                type: type,
                amount,
                category: typeof tx.category === "string" ? tx.category : undefined,
            });
            return acc;
        }, [])
        : [];
    const marketData = marketDataService
        ? await marketDataService.buildMarketReferenceBundle({
            userCurrency,
            investments: marketInvestments,
            transactions: marketTransactions,
        })
        : {
            generatedAt: new Date().toISOString(),
            baseCurrency: userCurrency,
            performance: {
                period: "unavailable",
                confidence: {
                    label: "none",
                    score: 0,
                    flags: ["market_data_service_not_configured"],
                },
                isComputable: false,
            },
            references: [],
        };
    const deterministicSnapshot = buildDeterministicSnapshot({
        ...state,
        financeData: {
            ...mergedFinanceData,
            marketData,
        },
    });
    return {
        financeData: {
            ...mergedFinanceData,
            marketData,
            deterministic_snapshot: deterministicSnapshot,
        },
    };
};
/**
 * Build structured financeData directly from a rich banking profile
 * that was normalised by ChatService.normalizeKnownFactsPayload().
 * This bypasses vector retrieval so user-provided figures are never
 * overwritten by stale embedded documents.
 */
const buildFinanceDataFromProfile = (knownFacts) => {
    const toNum = parseNumeric;
    const monthlyIncome = toNum(knownFacts.monthlyIncome);
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
        ? knownFacts.accounts
        : [];
    const accounts = rawAccounts.map((acc) => ({
        accountId: acc.accountId,
        type: acc.type,
        balance: toNum(acc.balance),
        averageMonthlyBalance: toNum(acc.averageMonthlyBalance),
    }));
    // Loans
    const rawLoans = Array.isArray(knownFacts.loans)
        ? knownFacts.loans
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
        ? knownFacts.subscriptions
        : [];
    const subscriptions = rawSubs.map((sub) => ({
        name: sub.name,
        amount: toNum(sub.amount),
        cycle: sub.cycle,
    }));
    const totalMonthlySubscriptions = toNum(knownFacts.monthlySubscriptionSpend)
        ?? subscriptions.reduce((s, sub) => s + (sub.amount ?? 0), 0);
    // Investments — expose current values, NOT profits (avoid hallucination)
    const rawInvestments = Array.isArray(knownFacts.investments)
        ? knownFacts.investments
        : [];
    const investments = rawInvestments.map((inv) => ({
        type: inv.type,
        currentValue: toNum(inv.currentValue),
        monthlyContribution: toNum(inv.monthlySip) ?? toNum(inv.monthlyContribution),
    }));
    const totalInvestmentValue = investments.reduce((s, inv) => s + (inv.currentValue ?? 0), 0);
    // Savings goals
    const rawGoals = Array.isArray(knownFacts.savingsGoals)
        ? knownFacts.savingsGoals
        : [];
    const savingsGoals = rawGoals.map((goal) => ({
        goalId: goal.goalId,
        targetAmount: toNum(goal.targetAmount),
        currentSaved: toNum(goal.currentSaved),
        targetDate: goal.targetDate,
        status: goal.status,
    }));
    const rawTransactions = Array.isArray(knownFacts.transactions)
        ? knownFacts.transactions
        : [];
    const transactions = rawTransactions
        .map((tx) => ({
        date: typeof tx.date === "string" ? tx.date : undefined,
        type: typeof tx.type === "string" ? tx.type.toUpperCase() : undefined,
        category: tx.category,
        amount: toNum(tx.amount),
    }))
        .filter((tx) => tx.date && tx.type && tx.amount !== undefined);
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
        transactions,
    };
};
const parseNumeric = (value) => {
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
const buildFallbackFinanceData = (knownFacts) => {
    const monthlyIncome = parseNumeric(knownFacts.monthlyIncome ?? knownFacts.monthlyNetIncome);
    const monthlyExpenses = parseNumeric(knownFacts.monthlyExpenses ?? knownFacts.monthlyCommittedExpenses);
    const currentBalance = parseNumeric(knownFacts.currentBalance ?? knownFacts.availableSavings);
    const explicitNetSavings = parseNumeric(knownFacts.netMonthlySavings);
    const netMonthlySavings = explicitNetSavings ??
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
