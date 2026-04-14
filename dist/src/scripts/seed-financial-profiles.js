import dotenv from "dotenv";
dotenv.config();
import { Kysely, PostgresDialect } from "kysely";
import pkg from "pg";
const { Pool } = pkg;
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
async function seedFinancialProfiles() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });
    const db = new Kysely({
        dialect: new PostgresDialect({ pool }),
    });
    try {
        // --- CORPORATE/TREASURY SEED LOGIC ---
        // Use the actual UUID for user_id (from Neon DB)
        const userId = '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1';
        const now = new Date().toISOString();
        // 1. Upsert user_financial_profiles
        await db
            .insertInto('user_financial_profiles')
            .values({
            user_id: userId,
            monthly_income: 50000,
            monthly_expenses: 30000,
            current_balance: 250000,
            currency: 'GBP',
        })
            .onConflict((oc) => oc.column('user_id').doUpdateSet({
            monthly_income: 50000,
            monthly_expenses: 30000,
            current_balance: 250000,
            currency: 'GBP',
        }))
            .execute();
        // 2. Upsert account_balances (current account)
        await db
            .insertInto('account_balances')
            .values({
            user_id: userId,
            account_type: 'current',
            provider: 'HSBC',
            account_ref: 'HSBC-001',
            balance: 250000,
            currency: 'GBP',
            metadata: { seeded: true },
            updated_at: now,
        })
            .onConflict((oc) => oc.columns(['user_id', 'account_ref']).doUpdateSet({
            balance: 250000,
            updated_at: now,
        }))
            .execute();
        // 3. Upsert treasury_decision_snapshots
        await db
            .insertInto('treasury_decision_snapshots')
            .values({
            user_id: userId,
            snapshot_date: now.slice(0, 10),
            weekly_outflow_baseline: 7000,
            midweek_inflow_baseline: 12000,
            late_inflow_count_last_4_weeks: 1,
            comfort_threshold: 100000,
            min_inflow_for_midweek_release: 5000,
            release_condition_hit_rate_10_weeks: 0.8,
            currency: 'GBP',
            metadata: { seeded: true },
            created_at: now,
            updated_at: now,
        })
            .onConflict((oc) => oc.columns(['user_id', 'snapshot_date']).doUpdateSet({
            weekly_outflow_baseline: 7000,
            midweek_inflow_baseline: 12000,
            late_inflow_count_last_4_weeks: 1,
            comfort_threshold: 100000,
            min_inflow_for_midweek_release: 5000,
            release_condition_hit_rate_10_weeks: 0.8,
            updated_at: now,
        }))
            .execute();
        console.log(`✅ Seeded corporate/treasury profile for user: ${userId}`);
    }
    finally {
        await pool.end();
    }
}
seedFinancialProfiles().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
