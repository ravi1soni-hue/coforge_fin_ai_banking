/**
 * Loads the user's financial profile from already-normalised knownFacts
 * (populated by client profile seed) or falls back to vector DB.
 */

import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { LlmClient } from "../agent_orchastration/llm/llmClient.js";
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

    // Secondary: query vector DB and let LLM extract profile
    console.log("[FinancialLoader] knownFacts empty — falling back to vector DB");
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
  "currency": "GBP" | "EUR" | "USD" | null
}`);

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
