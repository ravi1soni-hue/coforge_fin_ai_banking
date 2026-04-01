import type { GraphStateType } from "../../agent_orchastration/graph/state.js";
import { FinancialAssistantService } from "../../agent_orchastration/services/FinancialAssistantService.js";
import { Kysely, sql } from "kysely";

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
    const persistedFacts =
      this.sessionKnownFacts.get(sessionKey) ?? {};
    const extractedFacts = this.extractFactsFromMessage(
      request.message
    );
    const mergedKnownFacts = {
      ...persistedProfileFacts,
      ...persistedFacts,
      ...(request.knownFacts ?? {}),
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
    return {
      type: "FINAL",
      message:
        resultState.finalAnswer ??
        "I couldn’t generate an answer. Please try again.",
    };
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
}