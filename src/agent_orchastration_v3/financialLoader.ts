// DEBUG LOGGING: Add detailed logs for tracing pipeline
import fs from 'fs';
import path from 'path';
const DEBUG_LOG_PATH = process.env.FINAI_DEBUG_LOG_PATH || '/tmp/finai_debug.log';
function debugLog(label: string, data: any) {
  try {
    const logEntry = `[${new Date().toISOString()}] ${label}: ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}\n`;
    fs.appendFileSync(DEBUG_LOG_PATH, logEntry);
  } catch (e) {
    // ignore logging errors
  }
}
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

  /**
   * Extended debug: Optionally pass userQuery and llmIntent for full trace
   */
  async loadProfile(
    userId: string,
    knownFacts: Record<string, unknown>,
    userQuery?: string,
    llmIntent?: string,
  ): Promise<UserProfile> {
    debugLog('--- LOAD PROFILE START ---', { userQuery, llmIntent, knownFacts });
    const profileLookupUserId =
      typeof knownFacts.profileLookupUserId === "string" && knownFacts.profileLookupUserId.trim()
        ? knownFacts.profileLookupUserId.trim()
        : userId;
    debugLog('profileLookupUserId', profileLookupUserId);

    // Primary: use already-normalised facts from the profile seed
    // If intent is corporate/treasury, only sum current/operating/reserve accounts for liquidity
    let savings: number | undefined = undefined;
    let liquidity: number | undefined = undefined;
    const intentType = typeof knownFacts.intentType === "string" ? knownFacts.intentType : undefined;
    if (Array.isArray(knownFacts.accounts)) {
      debugLog('accounts', knownFacts.accounts);
      // Build the LLM extraction prompt outside the function call to avoid template literal issues
      const llmPrompt = [
        'Given the following user accounts and intent, extract the correct available savings (for retail/personal) or liquidity (for corporate/treasury) for affordability analysis.',
        '',
        `User intent: ${intentType ?? "unknown"}`,
        '',
        'Accounts:',
        JSON.stringify(knownFacts.accounts, null, 2),
        '',
        'Rules:',
        '- For retail/personal, savings should include any account that can be used for personal spending, excluding loans/credit/debt.',
        '- For corporate/treasury, liquidity should include any account that can be used for payments, excluding loans/credit/debt.',
        '- If unsure, err on the side of including more, but never include negative balances or debts.',
        '- Return the sum as availableSavings (retail) or liquidity (corporate/treasury).',
        '- Also extract monthlyIncome, monthlyExpenses, netMonthlySurplus, and currency if present in the data.',
        '',
        'Return ONLY valid JSON (no markdown):',
        '{',
        '  "availableSavings": number | null, // for retail',
        '  "liquidity": number | null,        // for corporate/treasury',
        '  "monthlyIncome": number | null,',
        '  "monthlyExpenses": number | null,',
        '  "netMonthlySurplus": number | null,',
        '  "currency": string | null',
        '}'
      ].join('\n');
      const llmProfile = await this.llm.generateJSON<{
        availableSavings: number | null;
        liquidity: number | null;
        monthlyIncome?: number | null;
        monthlyExpenses?: number | null;
        netMonthlySurplus?: number | null;
        currency?: string | null;
      }>(llmPrompt);
      debugLog('llmProfile extraction', llmProfile);
      if (intentType === "corporate_treasury") {
        liquidity = parseNum(llmProfile.liquidity);
      } else {
        savings = parseNum(llmProfile.availableSavings);
      }
      // Optionally override income/expenses/surplus/currency if LLM extracted them
      if (llmProfile.monthlyIncome != null) knownFacts.monthlyIncome = llmProfile.monthlyIncome;
      if (llmProfile.monthlyExpenses != null) knownFacts.monthlyExpenses = llmProfile.monthlyExpenses;
      if (llmProfile.netMonthlySurplus != null) knownFacts.netMonthlySurplus = llmProfile.netMonthlySurplus;
      if (llmProfile.currency != null) knownFacts.profileCurrency = llmProfile.currency;
    }
    // Fallbacks for legacy/seeded facts
    // Only use legacy fields if accounts array is missing or not an array
    if (!Array.isArray(knownFacts.accounts)) {
      debugLog('accounts missing, using legacy fields', knownFacts);
      if (savings === undefined) savings = parseNum(knownFacts.availableSavings) ?? parseNum(knownFacts.spendable_savings);
      if (liquidity === undefined) liquidity = parseNum(knownFacts.currentBalance);
      debugLog('legacy savings', savings);
      debugLog('legacy liquidity', liquidity);
    }

    const income = parseNum(knownFacts.monthlyIncome);
    const expenses = parseNum(knownFacts.monthlyExpenses);
    const surplus =
      parseNum(knownFacts.netMonthlySavings) ??
      (income !== undefined && expenses !== undefined ? income - expenses : undefined);
    debugLog('income', income);
    debugLog('expenses', expenses);
    debugLog('surplus', surplus);

    const currency = String(
      knownFacts.profileCurrency ?? knownFacts.currency ?? "GBP",
    );
    debugLog('currency', currency);

    const userName =
      typeof knownFacts.userName === "string" ? knownFacts.userName : undefined;
    debugLog('userName', userName);

    if (intentType === "corporate_treasury" && liquidity !== undefined && liquidity >= 0) {
      const profile = {
        availableSavings: liquidity, // For treasury, this is actually liquidity
        monthlyIncome: parseNum(knownFacts.monthlyIncome),
        monthlyExpenses: parseNum(knownFacts.monthlyExpenses),
        netMonthlySurplus: parseNum(knownFacts.netMonthlySurplus),
        homeCurrency: currency,
        userName,
      };
      debugLog('RETURN profile (corporate/treasury)', profile);
      debugLog('--- LOAD PROFILE END ---', {});
      return profile;
    }
    if ((intentType !== "corporate_treasury" || !intentType) && savings !== undefined && savings >= 0) {
      const profile = {
        availableSavings: savings,
        monthlyIncome: parseNum(knownFacts.monthlyIncome),
        monthlyExpenses: parseNum(knownFacts.monthlyExpenses),
        netMonthlySurplus: parseNum(knownFacts.netMonthlySurplus),
        homeCurrency: currency,
        userName,
      };
      debugLog('RETURN profile (retail)', profile);
      debugLog('--- LOAD PROFILE END ---', {});
      return profile;
    }

    // Tertiary: query vector DB and let LLM extract profile
    debugLog('knownFacts and DB empty — falling back to vector DB', {});
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

    const profile = {
      availableSavings: parseNum(extracted.availableSavings) ?? 0,
      monthlyIncome: parseNum(extracted.monthlyIncome),
      monthlyExpenses: parseNum(extracted.monthlyExpenses),
      netMonthlySurplus:
        extracted.monthlyIncome && extracted.monthlyExpenses
          ? extracted.monthlyIncome - extracted.monthlyExpenses
          : undefined,
      homeCurrency: extracted.currency ?? currency,
    };
    debugLog('RETURN profile (vector DB)', profile);
    debugLog('--- LOAD PROFILE END ---', {});
    return profile;
  }
}
