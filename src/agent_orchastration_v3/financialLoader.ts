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
    private readonly db?: Kysely<any>,
  ) {}

  async loadProfile(
    userId: string,
    knownFacts: Record<string, unknown>,
  ): Promise<UserProfile> {
    console.log("[FinancialLoader] loadProfile called for userId:", userId);
    if (!this.db) throw new Error("DB required for full profile aggregation");
    let profile: UserProfile = {
      availableSavings: 0,
      homeCurrency: "GBP"
    };

    // 1. User Financial Profile
    const [ufp]: any[] = await this.db.selectFrom("user_financial_profiles" as any).selectAll().where("user_id" as any, "=", userId as any).execute();
    console.log("[FinancialLoader] user_financial_profiles:", ufp);
    if (ufp) {
      profile.availableSavings = parseNum(ufp.current_balance) ?? 0;
      profile.accountBalance = parseNum(ufp.current_balance) ?? 0;
      profile.monthlyIncome = parseNum(ufp.monthly_income);
      profile.monthlyExpenses = parseNum(ufp.monthly_expenses);
      profile.netMonthlySurplus = parseNum(ufp.net_monthly_savings);
      profile.homeCurrency = ufp.currency ?? "GBP";
    }

    // 2. All Account Balances
    profile.accounts = await this.db.selectFrom("account_balances" as any).selectAll().where("user_id" as any, "=", userId as any).execute();
    console.log("[FinancialLoader] account_balances:", profile.accounts);

    // 3. Investments
    const investments = await this.db.selectFrom("investment_summary" as any).selectAll().where("user_id" as any, "=", userId as any).execute();
    profile.investments = investments;
    profile.topInvestments = investments?.slice(0, 3) ?? [];
    console.log("[FinancialLoader] investment_summary:", investments);

    // 4. Loans
    profile.loans = await this.db.selectFrom("loan_accounts" as any).selectAll().where("user_id" as any, "=", userId as any).execute();
    console.log("[FinancialLoader] loan_accounts:", profile.loans);

    // 5. Monthly Financial Summary
    profile.monthlySummaries = await this.db.selectFrom("financial_summary_monthly" as any).selectAll().where("user_id" as any, "=", userId as any).execute();
    console.log("[FinancialLoader] financial_summary_monthly:", profile.monthlySummaries);

    // 6. Credit Profile
    const [credit]: any[] = await this.db.selectFrom("credit_profile" as any).selectAll().where("user_id" as any, "=", userId as any).execute();
    console.log("[FinancialLoader] credit_profile:", credit);
    if (credit) profile.creditProfile = credit;

    // 7. User name (from users table)
    const [user]: any[] = await this.db.selectFrom("users" as any).selectAll().where("id" as any, "=", userId as any).execute();
    console.log("[FinancialLoader] users:", user);
    if (user) profile.userName = (user as any).full_name;

    // Fallback: If no data at all, return minimal
    if (!ufp && (!profile.accounts || profile.accounts.length === 0)) {
      profile.availableSavings = 0;
      profile.homeCurrency = "GBP";
    }

    console.log("[FinancialLoader] Final profile:", profile);
    return profile;
  }
}
