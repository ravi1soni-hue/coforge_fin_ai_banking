import { readFile } from "node:fs/promises";
import path from "node:path";
import { Kysely, PostgresDialect } from "kysely";
import pkg from "pg";

const { Pool } = pkg;

interface BankingUserData {
  userProfile?: {
    userId?: string;
    currency?: string;
    employment?: {
      monthlyIncome?: number;
    };
  };
  transactions?: Array<{ date?: string; type?: string; amount?: number }>;
  loans?: Array<{ emi?: number }>;
  subscriptions?: Array<{ amount?: number }>;
}

interface UserFinancialProfile {
  user_id: string;
  monthly_income?: number | null;
  monthly_expenses?: number | null;
  net_monthly_savings?: number | null;
  currency?: string | null;
}

interface Database {
  user_financial_profiles: UserFinancialProfile;
}

const parseNumeric = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[\s,]/g, "").replace(/[^\d.-]/g, "");
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const deriveTransactionStats = (
  transactions: Record<string, unknown>[] | undefined
): { averageMonthlyCredit?: number; averageMonthlyDebit?: number } => {
  if (!transactions || transactions.length === 0) return {};

  const monthlyCredits = new Map<string, number>();
  const monthlyDebits = new Map<string, number>();

  for (const tx of transactions) {
    const date = typeof tx.date === "string" ? tx.date : undefined;
    if (!date || date.length < 7) continue;

    const monthKey = date.slice(0, 7);
    const type = typeof tx.type === "string" ? tx.type.toUpperCase() : "";
    const amount = parseNumeric(tx.amount) ?? 0;

    if (amount <= 0) continue;

    if (type === "CREDIT") {
      monthlyCredits.set(monthKey, (monthlyCredits.get(monthKey) ?? 0) + amount);
    } else if (type === "DEBIT") {
      monthlyDebits.set(monthKey, (monthlyDebits.get(monthKey) ?? 0) + amount);
    }
  }

  return {
    averageMonthlyCredit:
      monthlyCredits.size > 0
        ? Array.from(monthlyCredits.values()).reduce((a, b) => a + b, 0) / monthlyCredits.size
        : undefined,
    averageMonthlyDebit:
      monthlyDebits.size > 0
        ? Array.from(monthlyDebits.values()).reduce((a, b) => a + b, 0) / monthlyDebits.size
        : undefined,
  };
};

export const seedFinancialProfiles = async (): Promise<void> => {
  console.log("🌱 Starting financial profiles seed...");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  try {
    const filePath = path.resolve(process.cwd(), "banking_user_data.json");
    const rawData = await readFile(filePath, "utf8");
    const parsed = JSON.parse(rawData) as BankingUserData;

    const userId = parsed.userProfile?.userId ?? "unknown_user";
    const currency = parsed.userProfile?.currency ?? "GBP";
    const monthlyIncomeFromEmployment = parseNumeric(parsed.userProfile?.employment?.monthlyIncome);

    const txStats = deriveTransactionStats(
      parsed.transactions as Record<string, unknown>[] | undefined
    );
    const monthlyIncome = monthlyIncomeFromEmployment ?? txStats.averageMonthlyCredit;
    const baseMonthlyExpenses = txStats.averageMonthlyDebit;

    const loans = parsed.loans || [];
    const monthlyLoanEmi = loans.reduce((sum, loan) => sum + (parseNumeric(loan.emi) ?? 0), 0);

    const subscriptions = parsed.subscriptions || [];
    const monthlySubscriptionSpend = subscriptions.reduce(
      (sum, sub) => sum + (parseNumeric(sub.amount) ?? 0),
      0
    );

    const monthlyExpenses = (baseMonthlyExpenses ?? 0) + monthlyLoanEmi + (monthlySubscriptionSpend ?? 0);
    const netMonthlySavings = (monthlyIncome ?? 0) - monthlyExpenses;

    console.log(`📊 Calculated financial profile for ${userId}:`);
    console.log(`   Monthly Income: ${monthlyIncome}`);
    console.log(`   Monthly Expenses: ${monthlyExpenses}`);
    console.log(`   Net Monthly Savings: ${netMonthlySavings}`);
    console.log(`   Currency: ${currency}`);

    // Check if row exists
    const existing = await db
      .selectFrom("user_financial_profiles")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (existing) {
      console.log(`📝 Updating existing profile for ${userId}...`);
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
    } else {
      console.log(`➕ Inserting new profile for ${userId}...`);
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

    console.log(`✅ Financial profile for ${userId} seeded successfully!`);
  } finally {
    await pool.end();
  }
};

seedFinancialProfiles().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
