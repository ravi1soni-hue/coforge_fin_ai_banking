import type { GraphStateType } from "../../agent_orchastration/graph/state.js";
import { FinancialAssistantService } from "../../agent_orchastration/services/FinancialAssistantService.js";
import { Kysely, sql } from "kysely";
import { ChatRepository } from "../../repo/chat.repo.js";
import { SessionRepository } from "../../repo/session.repo.js";

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
  private readonly chatRepo: ChatRepository;
  private readonly sessionRepo: SessionRepository;
  private financialProfileTableReady?: Promise<void>;
  private readonly sessionKnownFacts = new Map<
    string,
    Record<string, unknown>
  >();
  private readonly sessionConversationHistory = new Map<
    string,
    Array<{ role: "user" | "assistant"; content: string }>
  >();

  constructor({
    assistantService,
    db,
    chatRepo,
    sessionRepo,
  }: {
    assistantService: FinancialAssistantService;
    db: Kysely<unknown>;
    chatRepo: ChatRepository;
    sessionRepo: SessionRepository;
  }) {
    this.assistantService = assistantService;
    this.db = db;
    this.chatRepo = chatRepo;
    this.sessionRepo = sessionRepo;

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
    const cachedFacts = this.sessionKnownFacts.get(sessionKey);
    const persistedFacts =
      cachedFacts ??
      (await this.sessionRepo.getKnownFacts(
        request.userId,
        request.sessionId ?? "default"
      ));
    const normalizedIncomingFacts =
      this.normalizeKnownFactsPayload(
        request.knownFacts ?? {}
      );
    const mergedKnownFacts = {
      ...persistedProfileFacts,
      ...persistedFacts,
      ...normalizedIncomingFacts,
    };

    // Protect home currency: if a profileCurrency was set by the normalizer,
    // never let a trip-specific currency override it in the merged facts.
    if (mergedKnownFacts.profileCurrency && mergedKnownFacts.currency !== mergedKnownFacts.profileCurrency) {
      mergedKnownFacts.currency = mergedKnownFacts.profileCurrency as string;
    }

    this.sessionKnownFacts.set(sessionKey, mergedKnownFacts);
    await this.persistFinancialFactsToDb(
      request.userId,
      mergedKnownFacts
    );
    // Persist full session known facts (non-blocking)
    void this.sessionRepo.setKnownFacts(
      request.userId,
      request.sessionId ?? "default",
      mergedKnownFacts
    );

    // Build conversation history (last 10 turns to cap token usage)
    const historyKey = sessionKey;
    const cachedHistory = this.sessionConversationHistory.get(historyKey);
    const existingHistory =
      cachedHistory ??
      (await this.chatRepo.getHistory(
        request.userId,
        request.sessionId ?? "default",
        10
      ));
    const conversationHistory = [
      ...existingHistory,
      { role: "user" as const, content: request.message },
    ].slice(-10);

    const initialState: GraphStateType = {
      userId: request.userId,
      question: request.message,
      knownFacts: mergedKnownFacts,
      missingFacts: [],
      conversationHistory,
    };

    let resultState: Partial<GraphStateType> & { userId: string; question: string };

    try {
      resultState =
        await this.assistantService.run(initialState) as Partial<GraphStateType> & { userId: string; question: string };
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

    // ✅ Persist LLM-extracted facts back to session so follow-up turns retain full context.
    // Use await (not void) so pendingFollowUpAction is guaranteed written to DB before the
    // response is returned — critical for Railway restarts between conversational turns.
    if (resultState.knownFacts && Object.keys(resultState.knownFacts).length > 0) {
      const updatedFacts = { ...mergedKnownFacts, ...resultState.knownFacts };
      this.sessionKnownFacts.set(sessionKey, updatedFacts);
      await this.sessionRepo.setKnownFacts(
        request.userId,
        request.sessionId ?? "default",
        updatedFacts
      );
    }

    /* ---------------- FOLLOW‑UP CASE ---------------- */
    if (
      Array.isArray(resultState.missingFacts) &&
      resultState.missingFacts.length > 0
    ) {
      // Record assistant follow-up in history
      const followUpMsg = resultState.finalAnswer ?? "I need a bit more information to help you better.";
      this.sessionConversationHistory.set(historyKey, [
        ...conversationHistory,
        { role: "assistant" as const, content: followUpMsg },
      ].slice(-10));
      void this.chatRepo.saveMessage(request.userId, request.sessionId ?? "default", "user", request.message);
      void this.chatRepo.saveMessage(request.userId, request.sessionId ?? "default", "assistant", followUpMsg);

      return {
        type: "FOLLOW_UP",
        message: followUpMsg,
        missingFacts: resultState.missingFacts,
      };
    }

    /* ---------------- FINAL ANSWER CASE ---------------- */
    const finalMessage =
      resultState.finalAnswer ??
      "I couldn’t generate an answer. Please try again.";

    // Record assistant final response in conversation history
    this.sessionConversationHistory.set(historyKey, [
      ...conversationHistory,
      { role: "assistant" as const, content: finalMessage },
    ].slice(-10));
    void this.chatRepo.saveMessage(request.userId, request.sessionId ?? "default", "user", request.message);
    void this.chatRepo.saveMessage(request.userId, request.sessionId ?? "default", "assistant", finalMessage);
    return {
      type: "FINAL",
      message: finalMessage,
    };
  }

  private getSessionKey(
    userId: string,
    sessionId?: string
  ): string {
    return `${userId}::${sessionId ?? "default"}`;
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

    // Only add loan EMIs on top if the base was NOT derived from transaction history.
    // Transaction history already contains EMI debit entries, so adding them again
    // would double-count and produce an artificially low net monthly surplus.
    const isTransactionDerived =
      this.parseNumericFact(source.monthlyExpenses) === undefined &&
      this.parseNumericFact(source.monthlyCommittedExpenses) === undefined &&
      txStats.averageMonthlyDebit !== undefined;

    const monthlyExpenses =
      baseMonthlyExpenses !== undefined
        ? isTransactionDerived
          ? baseMonthlyExpenses  // transactions already include EMIs
          : baseMonthlyExpenses + monthlyLoanEmi
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
      // profileCurrency is the user's home currency (from their profile).
      // It must NOT be overridden by trip/purchase-specific currencies (EUR, USD, etc.)
      // extracted in later turns. Agents use this to correctly label savings and income.
      normalized.profileCurrency = currency;
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

    // Persist the user's HOME currency (profileCurrency), not a trip/purchase
    // currency that may have been extracted from a specific user message (e.g. "euros").
    const currencyToPersist =
      (typeof mergedFacts.profileCurrency === "string" && mergedFacts.profileCurrency)
        ? mergedFacts.profileCurrency
        : normalized.currency;

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
          ${currencyToPersist ?? null},
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

}