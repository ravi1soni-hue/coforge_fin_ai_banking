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
    const profileLookupUserId =
      typeof knownFacts.profileLookupUserId === "string" && knownFacts.profileLookupUserId.trim()
        ? knownFacts.profileLookupUserId.trim()
        : userId;

    // DEBUG: Log which userId is being used for profile lookup
    console.log(`[FinancialLoader][DEBUG] profileLookupUserId:`, profileLookupUserId);

    // Primary: use already-normalised facts from the profile seed
    // If intent is corporate/treasury, only sum current/operating/reserve accounts for liquidity
    let savings: number | undefined = undefined;
    let liquidity: number | undefined = undefined;
    const intentType = typeof knownFacts.intentType === "string" ? knownFacts.intentType : undefined;
    if (Array.isArray(knownFacts.accounts)) {
      if (intentType === "corporate_treasury") {
        // Only sum current/operating/reserve accounts
        liquidity = knownFacts.accounts
          .filter((a: any) => typeof a.type === "string" && ["current", "operating", "reserve"].includes(a.type.toLowerCase()))
          .reduce((sum: number, a: any) => sum + (parseNum(a.balance) ?? 0), 0);
      } else {
        // Only sum savings/investment accounts
        savings = knownFacts.accounts
          .filter((a: any) => typeof a.type === "string" && ["savings", "isa", "deposit", "investment"].includes(a.type.toLowerCase()))
          .reduce((sum: number, a: any) => sum + (parseNum(a.balance) ?? 0), 0);
      }
    }
    // Fallbacks for legacy/seeded facts
    // Only use legacy fields if accounts array is missing or not an array
    if (!Array.isArray(knownFacts.accounts)) {
      if (savings === undefined) savings = parseNum(knownFacts.availableSavings) ?? parseNum(knownFacts.spendable_savings);
      if (liquidity === undefined) liquidity = parseNum(knownFacts.currentBalance);
    }

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

    if (intentType === "corporate_treasury" && liquidity !== undefined && liquidity >= 0) {
      return {
        availableSavings: liquidity, // For treasury, this is actually liquidity
        monthlyIncome: income,
        monthlyExpenses: expenses,
        netMonthlySurplus: surplus,
        homeCurrency: currency,
        userName,
      };
    }
    if ((intentType !== "corporate_treasury" || !intentType) && savings !== undefined && savings >= 0) {
      return {
        availableSavings: savings,
        monthlyIncome: income,
        monthlyExpenses: expenses,
        netMonthlySurplus: surplus,
        homeCurrency: currency,
        userName,
      };
    }

    // Secondary: query account_balances + financial_summary_monthly (seeded, deterministic)
    if (this.db) {
      try {
        const row = await sql<{
          total_balance: string | null;
          currency: string | null;
        }>`
          SELECT COALESCE(SUM(balance), 0)::text AS total_balance,
                 MAX(currency) AS currency
          FROM account_balances
             WHERE user_id = ${profileLookupUserId}
        `.execute(this.db);

        console.log(`[FinancialLoader][DEBUG] account_balances row:`, row.rows);

        const monthlyRow = await sql<{
          monthly_income: string | null;
          monthly_expenses: string | null;
          net_cashflow: string | null;
        }>`
          SELECT total_income AS monthly_income,
                 total_expenses AS monthly_expenses,
                 net_cashflow
          FROM financial_summary_monthly
             WHERE user_id = ${profileLookupUserId}
          ORDER BY month DESC
          LIMIT 1
        `.execute(this.db);

        console.log(`[FinancialLoader][DEBUG] financial_summary_monthly row:`, monthlyRow.rows);

        const p = row.rows[0];
        const m = monthlyRow.rows[0];
        if (p && p.total_balance !== null && Number(p.total_balance) > 0) {
          const dbSavings  = Number(p.total_balance);
          const dbIncome   = m?.monthly_income   != null ? Number(m.monthly_income)   : undefined;
          const dbExpenses = m?.monthly_expenses != null ? Number(m.monthly_expenses) : undefined;
          const dbSurplus  = m?.net_cashflow     != null
            ? Number(m.net_cashflow)
            : dbIncome !== undefined && dbExpenses !== undefined
              ? dbIncome - dbExpenses
              : undefined;
          console.log(`[FinancialLoader] Loaded from account_balances+monthly: savings=${dbSavings}, income=${dbIncome}, expenses=${dbExpenses}, currency=${p.currency ?? currency}`);
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
      profileLookupUserId,
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
