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
import type { V3LlmClient } from "./llm/v3LlmClient.js";
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
    private readonly llm: V3LlmClient,
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
    let liquidity: number | undefined = undefined;
    const intentType = typeof knownFacts.intentType === "string" ? knownFacts.intentType : undefined;
    if (Array.isArray(knownFacts.accounts)) {
      debugLog('accounts', knownFacts.accounts);
      const llmPrompt = [
        'Given the following user accounts and intent, extract the correct liquidity (for corporate/treasury) for affordability analysis.',
        '',
        `User intent: ${intentType ?? "unknown"}`,
        '',
        'Accounts:',
        JSON.stringify(knownFacts.accounts, null, 2),
        '',
        'Rules:',
        '- For corporate/treasury, liquidity should ONLY include accounts with type current, operating, or reserve (case-insensitive).',
        '- Exclude all loan, credit, overdraft, or debt accounts.',
        '- If unsure, err on the side of including more, but never include negative balances or debts.',
        '- Return the sum as liquidity (corporate/treasury).',
        '- Also extract monthlyIncome, monthlyExpenses, netMonthlySurplus, and currency if present in the data.',
        '',
        'Return ONLY valid JSON (no markdown):',
        '{',
        '  "liquidity": number | null,        // for corporate/treasury',
        '  "monthlyIncome": number | null,',
        '  "monthlyExpenses": number | null,',
        '  "netMonthlySurplus": number | null,',
        '  "currency": string | null',
        '}'
      ].join('\n');
      debugLog('llmPrompt', llmPrompt);
      const llmProfile = await this.llm.chatJSON<{
        liquidity: number | null;
        monthlyIncome?: number | null;
        monthlyExpenses?: number | null;
        netMonthlySurplus?: number | null;
        currency?: string | null;
      }>([
        { role: "user", content: llmPrompt }
      ]);
      debugLog('llmProfile extraction', llmProfile);
      liquidity = parseNum(llmProfile.liquidity);
      if (llmProfile.monthlyIncome != null) knownFacts.monthlyIncome = llmProfile.monthlyIncome;
      if (llmProfile.monthlyExpenses != null) knownFacts.monthlyExpenses = llmProfile.monthlyExpenses;
      if (llmProfile.netMonthlySurplus != null) knownFacts.netMonthlySurplus = llmProfile.netMonthlySurplus;
      if (llmProfile.currency != null) knownFacts.profileCurrency = llmProfile.currency;
    }
    // Fallback for legacy/seeded facts (corporate only)
    if (!Array.isArray(knownFacts.accounts)) {
      debugLog('accounts missing, using legacy fields', knownFacts);
      if (liquidity === undefined) liquidity = parseNum(knownFacts.currentBalance);
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

    if (liquidity !== undefined && liquidity >= 0) {
      const profile = {
        availableLiquidity: liquidity,
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

    // Tertiary: query vector DB and let LLM extract profile
    debugLog('knownFacts and DB empty — falling back to vector DB', {});
    const context = await this.vectorQuery.getContext(
      profileLookupUserId,
      "savings balance monthly income expenses currency",
      { topK: 10, domain: "financial_profile" },
    );

    if (!context) {
      return {
        availableLiquidity: 0,
        monthlyIncome: undefined,
        monthlyExpenses: undefined,
        netMonthlySurplus: undefined,
        homeCurrency: currency,
        userName: undefined,
      };
    }

        const extracted = await this.llm.chatJSON<{
          availableLiquidity: number | null;
          monthlyIncome: number | null;
          monthlyExpenses: number | null;
          netMonthlySurplus?: number | null;
          currency: string | null;
          userName?: string | null;
        }>([
          {
            role: "user",
            content: `Extract the user's corporate/treasury financial summary from the context below.\n\nContext:\n${context}\n\nReturn ONLY valid JSON (no markdown):\n{\n  "availableLiquidity": number | null,\n  "monthlyIncome": number | null,\n  "monthlyExpenses": number | null,\n  "netMonthlySurplus": number | null,\n  "currency": "GBP" | null,\n  "userName": string | null\n}\n\nNote: This service is UK-only. currency is always "GBP" — only return null if completely absent from context.`
          }
        ]);

    const profile = {
      availableLiquidity: parseNum(extracted.availableLiquidity) ?? 0,
      monthlyIncome: parseNum(extracted.monthlyIncome),
      monthlyExpenses: parseNum(extracted.monthlyExpenses),
      netMonthlySurplus: extracted.netMonthlySurplus != null
        ? parseNum(extracted.netMonthlySurplus)
        : (extracted.monthlyIncome && extracted.monthlyExpenses
            ? extracted.monthlyIncome - extracted.monthlyExpenses
            : undefined),
      homeCurrency: extracted.currency ?? currency,
      userName: typeof extracted.userName === "string" ? extracted.userName : undefined,
    };
    debugLog('RETURN profile (vector DB)', profile);
    debugLog('--- LOAD PROFILE END ---', {});
    return profile;
  }
}
