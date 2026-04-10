/**
 * Loads the user's financial profile from already-normalised knownFacts
 * (populated by client profile seed) or falls back to the structured DB,
 * and finally to vector DB as last resort.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { VectorQueryService } from "./services/vector.query.service.js";
import type { LlmClient } from "./llm/llmClient.js";
import type { UserProfile } from "./types.js";

/** Parse a raw unknown value to a finite number (or undefined) */
const parseNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
};

export class FinancialLoader {
  constructor(
    private readonly vectorQuery: VectorQueryService,
    private readonly llm: LlmClient,
    private readonly db?: Kysely<unknown>,
  ) {}

  async loadProfile(
    userId: string,
    knownFacts: Record<string, unknown>,
  ): Promise<UserProfile> {
    // Primary: use already-normalised facts from the profile seed
    const savings =
      parseNum(knownFacts.availableSavings) ??
      parseNum(knownFacts.spendable_savings) ??
      parseNum(knownFacts.currentBalance);

    const income = parseNum(knownFacts.monthlyIncome);
    const expenses = parseNum(knownFacts.monthlyExpenses);
    const surplus =
      parseNum(knownFacts.netMonthlySavings) ??
      (income !== undefined && expenses !== undefined ? income - expenses : undefined);

    const currency = String(
      knownFacts.profileCurrency ?? knownFacts.currency ?? "GBP",
    );

    const userName =
      typeof knownFacts.userName === "string" ? knownFacts.userName : undefined;

    if (savings !== undefined && savings > 0) {
      return {
        availableSavings: savings,
        monthlyIncome: income,
        monthlyExpenses: expenses,
        netMonthlySurplus: surplus,
        homeCurrency: currency,
        userName,
      };
    }

    // Secondary: query structured user_financial_profiles table (reliable, deterministic)
    if (this.db) {
      try {
        const row = await sql<{
          current_balance: string | null;
          monthly_income: string | null;
          monthly_expenses: string | null;
          net_monthly_savings: string | null;
          currency: string | null;
        }>`
          SELECT current_balance, monthly_income, monthly_expenses, net_monthly_savings, currency
          FROM user_financial_profiles
          WHERE user_id = ${userId}
          LIMIT 1
        `.execute(this.db);

        const p = row.rows[0];
        if (p && p.current_balance !== null) {
          const dbSavings = Number(p.current_balance);
          const dbIncome = p.monthly_income !== null ? Number(p.monthly_income) : undefined;
          const dbExpenses = p.monthly_expenses !== null ? Number(p.monthly_expenses) : undefined;
          const dbSurplus =
            p.net_monthly_savings !== null
              ? Number(p.net_monthly_savings)
              : dbIncome !== undefined && dbExpenses !== undefined
                ? dbIncome - dbExpenses
                : undefined;
          console.log(`[FinancialLoader] Loaded from user_financial_profiles: savings=${dbSavings}, currency=${p.currency ?? currency}`);
          return {
            availableSavings: dbSavings,
            monthlyIncome: dbIncome,
            monthlyExpenses: dbExpenses,
            netMonthlySurplus: dbSurplus,
            homeCurrency: p.currency ?? currency,
            userName,
          };
        }
      } catch (err) {
        console.warn("[FinancialLoader] DB profile lookup failed, falling back to vector DB", err);
      }
    }

    // Tertiary: query vector DB and let LLM extract profile
    console.log("[FinancialLoader] knownFacts and DB empty — falling back to vector DB");
    const context = await this.vectorQuery.getContext(
      userId,
      "savings balance monthly income expenses currency",
      { topK: 6 },
    );

    if (!context) {
      return { availableSavings: 0, homeCurrency: currency };
    }

    const extracted = await this.llm.generateJSON<{
      availableSavings: number | null;
      monthlyIncome: number | null;
      monthlyExpenses: number | null;
      currency: string | null;
    }>(`Extract the user's financial summary from the context below.

Context:
${context}

Return ONLY valid JSON (no markdown):
{
  "availableSavings": number | null,
  "monthlyIncome": number | null,
  "monthlyExpenses": number | null,
  "currency": "GBP" | null
}

Note: This service is UK-only. currency is always "GBP" — only return null if completely absent from context.`);

    return {
      availableSavings: parseNum(extracted.availableSavings) ?? 0,
      monthlyIncome: parseNum(extracted.monthlyIncome),
      monthlyExpenses: parseNum(extracted.monthlyExpenses),
      netMonthlySurplus:
        extracted.monthlyIncome && extracted.monthlyExpenses
          ? extracted.monthlyIncome - extracted.monthlyExpenses
          : undefined,
      homeCurrency: extracted.currency ?? currency,
    };
  }
}
