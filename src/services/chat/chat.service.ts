import type { GraphStateType } from "../../agent_orchastration/graph/state.js";
import { FinancialAssistantService } from "../../agent_orchastration/services/FinancialAssistantService.js";
import {
  buildDeterministicSnapshot,
  validateAssistantAnswer,
} from "../../agent_orchastration/services/deterministicFinance.service.js";
import { Kysely, sql } from "kysely";
import { readFile } from "node:fs/promises";
import path from "node:path";

/* ---------------- Types ---------------- */

export interface ChatRequest {
  userId: string;
  message: string;
  sessionId?: string;
  knownFacts?: Record<string, unknown>;
}

export interface ChatResponse {
  type: "FOLLOW_UP" | "FINAL" | "ERROR";
  message: string;
  missingFacts?: string[];
}

/* ---------------- Service ---------------- */

export class ChatService {

  private readonly assistantService: FinancialAssistantService;
  private readonly db: Kysely<unknown>;
  private financialProfileTableReady?: Promise<void>;
  private fallbackBankingFacts?: Record<string, unknown>;
  private fallbackBankingFactsLoading?: Promise<Record<string, unknown>>;
  private readonly sessionKnownFacts = new Map<
    string,
    Record<string, unknown>
  >();

  constructor({
    assistantService,
    db,
  }: {
    assistantService: FinancialAssistantService;
    db: Kysely<unknown>;
  }) {
    this.assistantService = assistantService;
    this.db = db;

    console.log(
      "✅ assistantService REAL instance:",
      assistantService.constructor.name
    );
  }


  /**
   * Handles a single chat turn
   */
  async handleMessage(request: ChatRequest): Promise<ChatResponse> {
    const sessionKey = this.getSessionKey(
      request.userId,
      request.sessionId
    );

    const persistedProfileFacts =
      await this.loadFinancialFactsFromDb(request.userId);
    const fallbackFacts =
      await this.loadFallbackBankingFactsForSession(
        persistedProfileFacts,
        request.knownFacts
      );
    const persistedFacts =
      this.sessionKnownFacts.get(sessionKey) ?? {};
    const normalizedIncomingFacts =
      this.normalizeKnownFactsPayload(
        request.knownFacts ?? {}
      );
    const extractedFacts = this.extractFactsFromMessage(
      request.message
    );
    const mergedKnownFacts = {
      ...fallbackFacts,
      ...persistedProfileFacts,
      ...persistedFacts,
      ...normalizedIncomingFacts,
      ...extractedFacts,
    };

    this.sessionKnownFacts.set(sessionKey, mergedKnownFacts);
    await this.persistFinancialFactsToDb(
      request.userId,
      mergedKnownFacts
    );

    const initialState: GraphStateType = {
      userId: request.userId,
      question: request.message,
      knownFacts: mergedKnownFacts,
      missingFacts: [],
    };

    let resultState: GraphStateType;

    try {
      resultState =
        await this.assistantService.run(initialState);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error("❌ ChatService error:", message);

      return {
        type: "ERROR",
        message:
          "Sorry, I ran into an internal problem while answering. Please try again.",
      };
    }

    /* ---------------- FOLLOW‑UP CASE ---------------- */
    if (
      Array.isArray(resultState.missingFacts) &&
      resultState.missingFacts.length > 0
    ) {
      return {
        type: "FOLLOW_UP",
        message:
          resultState.finalAnswer ??
          "I need a bit more information to help you better.",
        missingFacts: resultState.missingFacts,
      };
    }

    /* ---------------- FINAL ANSWER CASE ---------------- */
    const finalMessage =
      resultState.finalAnswer ??
      "I couldn’t generate an answer. Please try again.";

    const validation = this.validateFinalAnswer(
      request.message,
      finalMessage,
      resultState
    );

    return {
      type: "FINAL",
      message: validation,
    };
  }

  private validateFinalAnswer(
    question: string,
    answer: string,
    resultState: GraphStateType
  ): string {
    const snapshot = buildDeterministicSnapshot(resultState);
    const validation = validateAssistantAnswer(
      question,
      answer,
      snapshot
    );

    if (!validation.valid) {
      return (
        validation.safeAnswer ??
        "I want to avoid giving you an inaccurate number. Please share the specific period and source values to confirm this precisely."
      );
    }

    return answer;
  }

  private getSessionKey(
    userId: string,
    sessionId?: string
  ): string {
    return `${userId}::${sessionId ?? "default"}`;
  }

  private extractFactsFromMessage(
    message: string
  ): Record<string, unknown> {
    const text = message.trim();
    const lowerText = text.toLowerCase();
    const facts: Record<string, unknown> = {};

    if (/\balone\b|\bsolo\b/.test(lowerText)) {
      facts.travelersCount = 1;
    }

    const fromMatch = text.match(
      /\bfrom\s+([a-zA-Z\s]{2,30})(?:\bto\b|\bnext\b|\bthis\b|\bfor\b|$)/i
    );
    if (fromMatch?.[1]) {
      facts.departureLocation = fromMatch[1].trim();
    }

    if (/\bnext month\b/i.test(text)) {
      facts.timeframe = "next_month";
    }

    const budgetMatch = text.match(
      /(?:budget|under|around)\s*(?:is|of|about)?\s*([£$€]?\s?\d[\d,]*(?:\.\d{1,2})?)/i
    );
    if (budgetMatch?.[1]) {
      facts.budget = budgetMatch[1].replace(/\s+/g, "").trim();
    }

    if (/\bjapan\b/i.test(text)) {
      facts.destination = "Japan";
      facts.queryType = "affordability";
    }

    const amountPrefixMatch = text.match(/([£$€])\s?(\d[\d,]*(?:\.\d{1,2})?)/);
    const amountSuffixMatch = text.match(/(\d[\d,]*(?:\.\d{1,2})?)\s?([£$€])/);

    const amountValue = amountPrefixMatch?.[2] ?? amountSuffixMatch?.[1];
    const amountCurrency = amountPrefixMatch?.[1] ?? amountSuffixMatch?.[2];

    if (amountValue) {
      const normalized = Number(amountValue.replace(/,/g, ""));
      if (!Number.isNaN(normalized)) {
        facts.targetAmount = normalized;
      }

      if (amountCurrency === "$") {
        facts.currency = "USD";
      } else if (amountCurrency === "£") {
        facts.currency = "GBP";
      } else if (amountCurrency === "€") {
        facts.currency = "EUR";
      }

      facts.queryType = facts.queryType ?? "affordability";
    }

    if (facts.budget && !facts.targetAmount) {
      const budgetNumeric = String(facts.budget).match(/\d[\d,]*(?:\.\d{1,2})?/);
      if (budgetNumeric?.[0]) {
        const normalizedBudget = Number(budgetNumeric[0].replace(/,/g, ""));
        if (!Number.isNaN(normalizedBudget)) {
          facts.targetAmount = normalizedBudget;
        }
      }
    }

    if (/\bcar\b/i.test(text)) {
      facts.goalType = "car";
      facts.queryType = "affordability";
    }

    if (/\bhouse\b|\bhome\b|\bapartment\b|\bproperty\b|\bmortgage\b/i.test(text)) {
      facts.goalType = facts.goalType ?? "house";
      facts.queryType = "affordability";
    }

    if (/\bphone\b|\biphone\b|\bmobile\b|\bsmartphone\b|\blaptop\b/i.test(text)) {
      facts.goalType = facts.goalType ?? "electronics";
      facts.queryType = "affordability";
    }

    if (/\bbuy\b|\bpurchase\b|\bmajor expense\b|\bbig expense\b/i.test(text)) {
      facts.queryType = facts.queryType ?? "affordability";
    }

    if (/\bholiday|trip|travel|vacation|afford|budget\b/i.test(text)) {
      facts.queryType = facts.queryType ?? "affordability";
    }

    if (/\bsubscription|subscriptions\b/i.test(text)) {
      facts.queryType = "subscriptions";
    }

    if (/\binvestment\b.*\bprofit\b|\bprofit\b.*\binvestment\b/i.test(text)) {
      facts.queryType = "investment_performance";
      if (/\blast month\b/i.test(text)) {
        facts.period = "last_month";
      }
    }

    if (/\bbank statement\b|\bstatement\b/i.test(text)) {
      facts.queryType = "bank_statement";
      if (/\b1 month\b|\bone month\b|\blast month\b/i.test(text)) {
        facts.period = "last_month";
      }
    }

    return facts;
  }

  private normalizeFinancialFacts(
    source: Record<string, unknown>
  ): {
    currentBalance?: number;
    monthlyIncome?: number;
    monthlyExpenses?: number;
    netMonthlySavings?: number;
    currency?: string;
  } {
    const currentBalance = this.parseNumericFact(
      source.currentBalance ?? source.availableSavings
    );

    const monthlyIncome = this.parseNumericFact(
      source.monthlyIncome ?? source.monthlyNetIncome
    );

    const monthlyExpenses = this.parseNumericFact(
      source.monthlyExpenses ?? source.monthlyCommittedExpenses
    );

    const explicitNetSavings = this.parseNumericFact(
      source.netMonthlySavings
    );

    const netMonthlySavings =
      explicitNetSavings ??
      (monthlyIncome !== undefined && monthlyExpenses !== undefined
        ? monthlyIncome - monthlyExpenses
        : undefined);

    const currencyValue = source.currency;
    const currency =
      typeof currencyValue === "string" && currencyValue.trim()
        ? currencyValue.trim().toUpperCase()
        : undefined;

    return {
      ...(currentBalance !== undefined
        ? { currentBalance }
        : {}),
      ...(monthlyIncome !== undefined ? { monthlyIncome } : {}),
      ...(monthlyExpenses !== undefined
        ? { monthlyExpenses }
        : {}),
      ...(netMonthlySavings !== undefined
        ? { netMonthlySavings }
        : {}),
      ...(currency ? { currency } : {}),
    };
  }

  private normalizeKnownFactsPayload(
    source: Record<string, unknown>
  ): Record<string, unknown> {
    if (!this.isObject(source)) {
      return {};
    }

    const normalized: Record<string, unknown> = {
      ...source,
    };

    const userProfile = this.asObject(source.userProfile);
    const employment = this.asObject(userProfile?.employment);

    const monthlyIncomeFromEmployment = this.parseNumericFact(
      employment?.monthlyIncome
    );

    const accounts = this.asObjectArray(source.accounts);
    const totalBalance = accounts.reduce((sum, account) => {
      const balance = this.parseNumericFact(account.balance);
      return sum + (balance ?? 0);
    }, 0);

    const savingsAccount = accounts.find(
      (account) =>
        typeof account.type === "string" &&
        account.type.toLowerCase() === "savings"
    );

    const savingsBalance = this.parseNumericFact(
      savingsAccount?.balance
    );

    const loans = this.asObjectArray(source.loans);
    const monthlyLoanEmi = loans.reduce((sum, loan) => {
      const emi = this.parseNumericFact(loan.emi);
      return sum + (emi ?? 0);
    }, 0);

    const subscriptions = this.asObjectArray(
      source.subscriptions
    );
    const monthlySubscriptionSpend = subscriptions.reduce(
      (sum, item) => {
        const amount = this.parseNumericFact(item.amount);
        return sum + (amount ?? 0);
      },
      0
    );

    const transactions = this.asObjectArray(source.transactions);
    const txStats = this.deriveTransactionStats(transactions);

    const monthlyIncome =
      this.parseNumericFact(source.monthlyIncome) ??
      this.parseNumericFact(source.monthlyNetIncome) ??
      monthlyIncomeFromEmployment ??
      txStats.averageMonthlyCredit;

    const baseMonthlyExpenses =
      this.parseNumericFact(source.monthlyExpenses) ??
      this.parseNumericFact(source.monthlyCommittedExpenses) ??
      txStats.averageMonthlyDebit;

    const monthlyExpenses =
      baseMonthlyExpenses !== undefined
        ? baseMonthlyExpenses + monthlyLoanEmi
        : undefined;

    const netMonthlySavings =
      this.parseNumericFact(source.netMonthlySavings) ??
      (monthlyIncome !== undefined &&
      monthlyExpenses !== undefined
        ? monthlyIncome - monthlyExpenses
        : undefined);

    const currency =
      typeof source.currency === "string"
        ? source.currency
        : typeof userProfile?.currency === "string"
        ? userProfile.currency
        : undefined;

    if (userProfile?.name) {
      normalized.userName = userProfile.name;
    }

    if (monthlyIncome !== undefined) {
      normalized.monthlyIncome = monthlyIncome;
      normalized.monthlyNetIncome = monthlyIncome;
    }

    if (monthlyExpenses !== undefined) {
      normalized.monthlyExpenses = monthlyExpenses;
      normalized.monthlyCommittedExpenses = monthlyExpenses;
    }

    if (netMonthlySavings !== undefined) {
      normalized.netMonthlySavings = netMonthlySavings;
    }

    if (totalBalance > 0) {
      normalized.currentBalance = totalBalance;
    }

    if (savingsBalance !== undefined) {
      normalized.availableSavings = savingsBalance;
    }

    if (monthlyLoanEmi > 0) {
      normalized.monthlyLoanEmi = monthlyLoanEmi;
    }

    if (monthlySubscriptionSpend > 0) {
      normalized.monthlySubscriptionSpend =
        monthlySubscriptionSpend;
    }

    if (txStats.averageMonthlyDebit !== undefined) {
      normalized.averageMonthlyDebit =
        txStats.averageMonthlyDebit;
    }

    if (txStats.averageMonthlyCredit !== undefined) {
      normalized.averageMonthlyCredit =
        txStats.averageMonthlyCredit;
    }

    if (currency) {
      normalized.currency = currency;
    }

    const savingsGoals = this.asObjectArray(source.savingsGoals);
    if (savingsGoals.length > 0) {
      normalized.savingsGoals = savingsGoals.map((goal) => ({
        goalId: goal.goalId,
        targetAmount: this.parseNumericFact(goal.targetAmount),
        currentSaved: this.parseNumericFact(goal.currentSaved),
        targetDate: goal.targetDate,
        status: goal.status,
      }));
    }

    normalized.hasBankingProfile = true;
    return normalized;
  }

  private deriveTransactionStats(
    transactions: Record<string, unknown>[]
  ): {
    averageMonthlyCredit?: number;
    averageMonthlyDebit?: number;
  } {
    if (transactions.length === 0) {
      return {};
    }

    const monthlyCredits = new Map<string, number>();
    const monthlyDebits = new Map<string, number>();

    for (const tx of transactions) {
      const date =
        typeof tx.date === "string" ? tx.date : undefined;
      if (!date || date.length < 7) {
        continue;
      }

      const monthKey = date.slice(0, 7);
      const type =
        typeof tx.type === "string"
          ? tx.type.toUpperCase()
          : "";
      const amount = this.parseNumericFact(tx.amount) ?? 0;

      if (amount <= 0) {
        continue;
      }

      if (type === "CREDIT") {
        monthlyCredits.set(
          monthKey,
          (monthlyCredits.get(monthKey) ?? 0) + amount
        );
      } else if (type === "DEBIT") {
        monthlyDebits.set(
          monthKey,
          (monthlyDebits.get(monthKey) ?? 0) + amount
        );
      }
    }

    return {
      averageMonthlyCredit: this.averageMapValues(
        monthlyCredits
      ),
      averageMonthlyDebit: this.averageMapValues(
        monthlyDebits
      ),
    };
  }

  private averageMapValues(
    input: Map<string, number>
  ): number | undefined {
    if (input.size === 0) {
      return undefined;
    }

    let total = 0;
    for (const value of input.values()) {
      total += value;
    }

    return total / input.size;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private asObject(
    value: unknown
  ): Record<string, unknown> | undefined {
    return this.isObject(value) ? value : undefined;
  }

  private asObjectArray(
    value: unknown
  ): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is Record<string, unknown> =>
      this.isObject(item)
    );
  }

  private parseNumericFact(
    value: unknown
  ): number | undefined {
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
  }

  private async loadFinancialFactsFromDb(
    userId: string
  ): Promise<Record<string, unknown>> {
    try {
      await this.ensureFinancialProfileTable();

      const row = await sql<{
        current_balance: number | null;
        monthly_income: number | null;
        monthly_expenses: number | null;
        net_monthly_savings: number | null;
        currency: string | null;
      }>`
        SELECT
          current_balance,
          monthly_income,
          monthly_expenses,
          net_monthly_savings,
          currency
        FROM user_financial_profiles
        WHERE user_id = ${userId}
        LIMIT 1
      `.execute(this.db);

      const profile = row.rows[0];
      if (!profile) {
        return {};
      }

      return {
        ...(profile.current_balance !== null
          ? { currentBalance: Number(profile.current_balance) }
          : {}),
        ...(profile.monthly_income !== null
          ? { monthlyIncome: Number(profile.monthly_income) }
          : {}),
        ...(profile.monthly_expenses !== null
          ? { monthlyExpenses: Number(profile.monthly_expenses) }
          : {}),
        ...(profile.net_monthly_savings !== null
          ? {
              netMonthlySavings: Number(
                profile.net_monthly_savings
              ),
            }
          : {}),
        ...(profile.currency ? { currency: profile.currency } : {}),
      };
    } catch (error) {
      console.warn(
        "Failed loading user financial profile from DB",
        error
      );
      return {};
    }
  }

  private async persistFinancialFactsToDb(
    userId: string,
    mergedFacts: Record<string, unknown>
  ): Promise<void> {
    const normalized = this.normalizeFinancialFacts(mergedFacts);
    if (Object.keys(normalized).length === 0) {
      return;
    }

    try {
      await this.ensureFinancialProfileTable();

      await sql`
        INSERT INTO user_financial_profiles (
          user_id,
          current_balance,
          monthly_income,
          monthly_expenses,
          net_monthly_savings,
          currency,
          updated_at
        )
        VALUES (
          ${userId},
          ${normalized.currentBalance ?? null},
          ${normalized.monthlyIncome ?? null},
          ${normalized.monthlyExpenses ?? null},
          ${normalized.netMonthlySavings ?? null},
          ${normalized.currency ?? null},
          NOW()
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          current_balance = COALESCE(EXCLUDED.current_balance, user_financial_profiles.current_balance),
          monthly_income = COALESCE(EXCLUDED.monthly_income, user_financial_profiles.monthly_income),
          monthly_expenses = COALESCE(EXCLUDED.monthly_expenses, user_financial_profiles.monthly_expenses),
          net_monthly_savings = COALESCE(EXCLUDED.net_monthly_savings, user_financial_profiles.net_monthly_savings),
          currency = COALESCE(EXCLUDED.currency, user_financial_profiles.currency),
          updated_at = NOW()
      `.execute(this.db);
    } catch (error) {
      console.warn(
        "Failed persisting user financial profile to DB",
        error
      );
    }
  }

  private async ensureFinancialProfileTable(): Promise<void> {
    if (!this.financialProfileTableReady) {
      this.financialProfileTableReady = sql`
        CREATE TABLE IF NOT EXISTS user_financial_profiles (
          user_id TEXT PRIMARY KEY,
          current_balance NUMERIC(14, 2),
          monthly_income NUMERIC(14, 2),
          monthly_expenses NUMERIC(14, 2),
          net_monthly_savings NUMERIC(14, 2),
          currency VARCHAR(10),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `
        .execute(this.db)
        .then(() => undefined)
        .catch((error) => {
          this.financialProfileTableReady = undefined;
          throw error;
        });
    }

    await this.financialProfileTableReady;
  }

  private async loadFallbackBankingFactsForSession(
    persistedProfileFacts: Record<string, unknown>,
    incomingKnownFacts?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const hasPersistedRichProfile =
      "userProfile" in persistedProfileFacts ||
      "accounts" in persistedProfileFacts ||
      "transactions" in persistedProfileFacts ||
      "investments" in persistedProfileFacts ||
      "subscriptions" in persistedProfileFacts ||
      "loans" in persistedProfileFacts ||
      "savingsGoals" in persistedProfileFacts;
    const hasIncomingProfile =
      this.isObject(incomingKnownFacts) &&
      ("userProfile" in incomingKnownFacts ||
        "accounts" in incomingKnownFacts ||
        "transactions" in incomingKnownFacts);

    if (hasPersistedRichProfile || hasIncomingProfile) {
      return {};
    }

    return this.getFallbackBankingFacts();
  }

  private async getFallbackBankingFacts(): Promise<Record<string, unknown>> {
    if (this.fallbackBankingFacts) {
      return this.fallbackBankingFacts;
    }

    if (!this.fallbackBankingFactsLoading) {
      this.fallbackBankingFactsLoading = this.readFallbackBankingFacts();
    }

    try {
      this.fallbackBankingFacts = await this.fallbackBankingFactsLoading;
      return this.fallbackBankingFacts;
    } finally {
      this.fallbackBankingFactsLoading = undefined;
    }
  }

  private async readFallbackBankingFacts(): Promise<Record<string, unknown>> {
    try {
      const filePath = path.resolve(process.cwd(), "banking_user_data.json");
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return this.normalizeKnownFactsPayload(parsed);
    } catch (error) {
      console.warn("Failed loading fallback banking profile", error);
      return {};
    }
  }
}