export class StructuredFinancialRepository {
    db;
    constructor({ db }) {
        this.db = db;
    }
    async getBalances(userId) {
        return this.db
            .selectFrom("account_balances")
            .select(["account_type", "provider", "balance", "currency", "updated_at"])
            .where("user_id", "=", userId)
            .execute();
    }
    async getLatestTreasuryDecisionSnapshot(userId) {
        const row = await this.db
            .selectFrom("treasury_decision_snapshots")
            .selectAll()
            .where("user_id", "=", userId)
            .orderBy("snapshot_date", "desc")
            .limit(1)
            .executeTakeFirst();
        return row ?? null;
    }
    async getTreasurySupplierCandidates(userId) {
        return this.db
            .selectFrom("treasury_supplier_payment_candidates")
            .selectAll()
            .where("user_id", "=", userId)
            .execute();
    }
    async getRecentTreasuryCashflow(userId, days = 90) {
        return this.db
            .selectFrom("treasury_cashflow_daily")
            .selectAll()
            .where("user_id", "=", userId)
            .orderBy("business_date", "desc")
            .limit(days)
            .execute();
    }
}
