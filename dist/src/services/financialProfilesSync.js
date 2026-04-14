import { readFile } from "node:fs/promises";
import path from "node:path";
const parseNumeric = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.replace(/[\s,]/g, "").replace(/[^\d.-]/g, "");
        if (!normalized)
            return undefined;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};
const deriveTransactionStats = (transactions) => {
    if (!transactions || transactions.length === 0)
        return {};
    const monthlyCredits = new Map();
    const monthlyDebits = new Map();
    for (const tx of transactions) {
        const date = typeof tx.date === "string" ? tx.date : undefined;
        if (!date || date.length < 7)
            continue;
        const monthKey = date.slice(0, 7);
        const type = typeof tx.type === "string" ? tx.type.toUpperCase() : "";
        const amount = parseNumeric(tx.amount) ?? 0;
        if (amount <= 0)
            continue;
        if (type === "CREDIT") {
            monthlyCredits.set(monthKey, (monthlyCredits.get(monthKey) ?? 0) + amount);
        }
        else if (type === "DEBIT") {
            monthlyDebits.set(monthKey, (monthlyDebits.get(monthKey) ?? 0) + amount);
        }
    }
    return {
        averageMonthlyCredit: monthlyCredits.size > 0
            ? Array.from(monthlyCredits.values()).reduce((a, b) => a + b, 0) / monthlyCredits.size
            : undefined,
        averageMonthlyDebit: monthlyDebits.size > 0
            ? Array.from(monthlyDebits.values()).reduce((a, b) => a + b, 0) / monthlyDebits.size
            : undefined,
    };
};
/**
 * Sync user financial profiles from banking_user_data.json to database.
 * This ensures transaction-derived calculations are always current.
 */
export const syncUserFinancialProfiles = async (db) => {
    try {
        const filePath = path.resolve(process.cwd(), "banking_user_data.json");
        const rawData = await readFile(filePath, "utf8");
        const parsed = JSON.parse(rawData);
        const userId = parsed.userProfile?.userId ?? "unknown_user";
        const currency = parsed.userProfile?.currency ?? "GBP";
        const monthlyIncomeFromEmployment = parseNumeric(parsed.userProfile?.employment?.monthlyIncome);
        const txStats = deriveTransactionStats(parsed.transactions);
        const monthlyIncome = monthlyIncomeFromEmployment ?? txStats.averageMonthlyCredit;
        const baseMonthlyExpenses = txStats.averageMonthlyDebit;
        const loans = parsed.loans || [];
        const monthlyLoanEmi = loans.reduce((sum, loan) => sum + (parseNumeric(loan.emi) ?? 0), 0);
        const subscriptions = parsed.subscriptions || [];
        const monthlySubscriptionSpend = subscriptions.reduce((sum, sub) => sum + (parseNumeric(sub.amount) ?? 0), 0);
        const monthlyExpenses = (baseMonthlyExpenses ?? 0) + monthlyLoanEmi + (monthlySubscriptionSpend ?? 0);
        const netMonthlySavings = (monthlyIncome ?? 0) - monthlyExpenses;
        const existing = await db
            .selectFrom("user_financial_profiles")
            .selectAll()
            .where("user_id", "=", userId)
            .executeTakeFirst();
        if (existing) {
            const changed = existing.monthly_income !== monthlyIncome ||
                existing.monthly_expenses !== monthlyExpenses ||
                existing.net_monthly_savings !== netMonthlySavings;
            if (changed) {
                console.log(`🔄 Syncing financial profile for ${userId}...`);
                console.log(`   Old: Income=${existing.monthly_income}, Expenses=${existing.monthly_expenses}, Savings=${existing.net_monthly_savings}`);
                console.log(`   New: Income=${monthlyIncome}, Expenses=${monthlyExpenses}, Savings=${netMonthlySavings}`);
                await db
                    .updateTable("user_financial_profiles")
                    .set({
                    monthly_income: monthlyIncome,
                    monthly_expenses: monthlyExpenses,
                    net_monthly_savings: netMonthlySavings,
                    currency,
                })
                    .where("user_id", "=", userId)
                    .execute();
            }
        }
        else {
            console.log(`✅ Inserting new profile for ${userId}...`);
            await db
                .insertInto("user_financial_profiles")
                .values({
                user_id: userId,
                monthly_income: monthlyIncome,
                monthly_expenses: monthlyExpenses,
                net_monthly_savings: netMonthlySavings,
                currency,
            })
                .execute();
        }
    }
    catch (error) {
        console.warn("⚠️  Failed to sync user financial profiles:", error instanceof Error ? error.message : error);
    }
};
