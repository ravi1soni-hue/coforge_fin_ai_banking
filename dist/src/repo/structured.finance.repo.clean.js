export class StructuredFinancialRepository {
    db;
    constructor({ db }) {
        this.db = db;
    }
    async getBalances(userId) {
        console.log(`[StructuredFinancialRepository] getBalances called with userId=${userId}`);
        try {
            const result = await this.db
                .selectFrom("account_balances")
                .select(["account_type", "provider", "balance", "currency", "updated_at"])
                .where("user_id", "=", userId)
                .execute();
            console.log(`[StructuredFinancialRepository] getBalances result:`, JSON.stringify(result));
            return result;
        }
        catch (err) {
            console.error(`[StructuredFinancialRepository] getBalances error:`, err);
            throw err;
        }
    }
    async getLatestTreasuryDecisionSnapshot(userId) {
        console.log(`[StructuredFinancialRepository] getLatestTreasuryDecisionSnapshot called with userId=${userId}`);
        try {
            const row = await this.db
                .selectFrom("treasury_decision_snapshots")
                .selectAll()
                .where("user_id", "=", userId)
                .orderBy("snapshot_date", "desc")
                .limit(1)
                .executeTakeFirst();
            console.log(`[StructuredFinancialRepository] getLatestTreasuryDecisionSnapshot result:`, JSON.stringify(row));
            return row ?? null;
        }
        catch (err) {
            console.error(`[StructuredFinancialRepository] getLatestTreasuryDecisionSnapshot error:`, err);
            throw err;
        }
    }
    async getTreasurySupplierCandidates(userId) {
        console.log(`[StructuredFinancialRepository] getTreasurySupplierCandidates called with userId=${userId}`);
        try {
            const result = await this.db
                .selectFrom("treasury_supplier_payment_candidates")
                .selectAll()
                .where("user_id", "=", userId)
                .execute();
            console.log(`[StructuredFinancialRepository] getTreasurySupplierCandidates result:`, JSON.stringify(result));
            return result;
        }
        catch (err) {
            console.error(`[StructuredFinancialRepository] getTreasurySupplierCandidates error:`, err);
            throw err;
        }
    }
    async getRecentTreasuryCashflow(userId, days = 90) {
        console.log(`[StructuredFinancialRepository] getRecentTreasuryCashflow called with userId=${userId}, days=${days}`);
        try {
            const result = await this.db
                .selectFrom("treasury_cashflow_daily")
                .selectAll()
                .where("user_id", "=", userId)
                .orderBy("business_date", "desc")
                .limit(days)
                .execute();
            console.log(`[StructuredFinancialRepository] getRecentTreasuryCashflow result:`, JSON.stringify(result));
            return result;
        }
        catch (err) {
            console.error(`[StructuredFinancialRepository] getRecentTreasuryCashflow error:`, err);
            throw err;
        }
    }
}
