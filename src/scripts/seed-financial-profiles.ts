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
    // No retail/personal logic remains. Implement corporate/treasury seed logic if required.
    console.log("No retail/personal logic remains in seed-financial-profiles.ts. Implement corporate/treasury logic if needed.");
  } finally {
    await pool.end();
  }
};

seedFinancialProfiles().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
