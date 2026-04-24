/**
 * Loads the user's financial profile from already-normalised knownFacts
 * (populated by client profile seed) or falls back to the structured DB,
 * and finally to vector DB as last resort.
 */
/** Parse a raw unknown value to a finite number (or undefined) */
const parseNum = (v) => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0)
        return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(n) && n > 0)
            return n;
    }
    return undefined;
};
export class FinancialLoader {
    vectorQuery;
    llm;
    db;
    constructor(vectorQuery, llm, db) {
        this.vectorQuery = vectorQuery;
        this.llm = llm;
        this.db = db;
    }
    async loadProfile(userId, knownFacts) {
        // Aggregate all relevant tables for a unified profile
        if (!this.db)
            throw new Error("DB required for full profile aggregation");
        let profile = {
            availableSavings: 0,
            homeCurrency: "GBP"
        };
        // 1. User Financial Profile
        const [ufp] = await this.db.selectFrom("user_financial_profiles").selectAll().where("user_id", "=", userId).execute();
        if (ufp) {
            profile.availableSavings = parseNum(ufp.current_balance) ?? 0;
            profile.monthlyIncome = parseNum(ufp.monthly_income);
            profile.monthlyExpenses = parseNum(ufp.monthly_expenses);
            profile.netMonthlySurplus = parseNum(ufp.net_monthly_savings);
            profile.homeCurrency = ufp.currency ?? "GBP";
        }
        // 2. All Account Balances
        profile.accounts = await this.db.selectFrom("account_balances").selectAll().where("user_id", "=", userId).execute();
        // 3. Investments
        profile.investments = await this.db.selectFrom("investment_summary").selectAll().where("user_id", "=", userId).execute();
        // 4. Loans
        profile.loans = await this.db.selectFrom("loan_accounts").selectAll().where("user_id", "=", userId).execute();
        // 5. Monthly Financial Summary
        profile.monthlySummaries = await this.db.selectFrom("financial_summary_monthly").selectAll().where("user_id", "=", userId).execute();
        // 6. Credit Profile
        const [credit] = await this.db.selectFrom("credit_profile").selectAll().where("user_id", "=", userId).execute();
        if (credit)
            profile.creditProfile = credit;
        // 7. User name (from users table)
        const [user] = await this.db.selectFrom("users").selectAll().where("id", "=", userId).execute();
        if (user)
            profile.userName = user.full_name;
        // Fallback: If no data at all, return minimal
        if (!ufp && (!profile.accounts || profile.accounts.length === 0)) {
            profile.availableSavings = 0;
            profile.homeCurrency = "GBP";
        }
        return profile;
    }
}
