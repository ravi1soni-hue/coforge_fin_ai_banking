import { sql } from "kysely";
export class StructuredFinancialRepository {
    db;
    constructor({ db }) {
        this.db = db;
    }
    async syncAllFinancialData(params) {
        return this.db.transaction().execute(async (trx) => {
            if (params.balances.length) {
                await trx
                    .insertInto("account_balances")
                    .values(params.balances.map((b) => ({
                    user_id: b.userId,
                    account_type: b.accountType,
                    provider: b.provider,
                    account_ref: b.accountRef,
                    balance: b.balance,
                    currency: b.currency,
                    metadata: b.metadata ?? {},
                    updated_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
                })))
                    .execute();
            }
            await trx
                .insertInto("financial_summary_monthly")
                .values({
                user_id: params.monthlySummary.userId,
                month: params.monthlySummary.month,
                total_income: params.monthlySummary.totalIncome ?? null,
                total_expenses: params.monthlySummary.totalExpenses ?? null,
                total_savings: params.monthlySummary.totalSavings ?? null,
                total_investments: params.monthlySummary.totalInvestments ?? null,
                net_cashflow: params.monthlySummary.netCashflow ?? null,
                currency: params.monthlySummary.currency,
                metadata: params.monthlySummary.metadata ?? {},
                created_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            })
                .execute();
            await trx
                .insertInto("investment_summary")
                .values({
                user_id: params.investments.userId,
                as_of_month: params.investments.asOfMonth,
                total_invested: params.investments.totalInvested,
                total_current_value: params.investments.totalCurrentValue,
                total_unrealized_gain: params.investments.totalUnrealizedGain ?? null,
                currency: params.investments.currency,
                investment_info: params.investments.investmentInfo ?? {},
                metadata: params.investments.metadata ?? {},
                updated_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            })
                .execute();
            if (params.loans?.length) {
                await trx
                    .insertInto("loan_accounts")
                    .values(params.loans.map((l) => ({
                    user_id: l.userId,
                    loan_type: l.loanType,
                    provider: l.provider,
                    principal_amount: l.principalAmount,
                    outstanding_amount: l.outstandingAmount,
                    interest_rate: l.interestRate ?? null,
                    emi_amount: l.emiAmount ?? null,
                    tenure_months: l.tenureMonths ?? null,
                    status: l.status,
                    currency: l.currency,
                    metadata: l.metadata ?? {},
                    updated_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
                })))
                    .execute();
            }
            if (params.creditProfile) {
                await trx
                    .insertInto("credit_profile")
                    .values({
                    user_id: params.creditProfile.userId,
                    credit_score: params.creditProfile.creditScore,
                    score_band: params.creditProfile.scoreBand,
                    bureau: params.creditProfile.bureau ?? null,
                    metadata: params.creditProfile.metadata ?? {},
                    last_reported_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
                })
                    .execute();
            }
        });
    }
    async getBalances(userId) {
        return this.db
            .selectFrom("account_balances")
            .select(["account_type", "provider", "balance", "currency", "updated_at"])
            .where("user_id", "=", userId)
            .execute();
    }
    async getMonthlySummary(userId, month) {
        return this.db
            .selectFrom("financial_summary_monthly")
            .select(["month", "total_income", "total_expenses", "total_savings", "total_investments", "net_cashflow", "currency", "metadata"])
            .where("user_id", "=", userId)
            .where("month", "=", month)
            .executeTakeFirst();
    }
    async getLatestMonthlySummary(userId) {
        return this.db
            .selectFrom("financial_summary_monthly")
            .select(["month", "total_income", "total_expenses", "total_savings", "total_investments", "net_cashflow", "currency", "metadata"])
            .where("user_id", "=", userId)
            .orderBy("month", "desc")
            .executeTakeFirst();
    }
    async getActiveLoans(userId) {
        return this.db
            .selectFrom("loan_accounts")
            .select(["loan_type", "provider", "outstanding_amount", "emi_amount", "status", "currency"])
            .where("user_id", "=", userId)
            .where("status", "=", 1)
            .execute();
    }
    async getCreditProfile(userId) {
        return this.db
            .selectFrom("credit_profile")
            .select(["credit_score", "score_band", "bureau"])
            .where("user_id", "=", userId)
            .executeTakeFirst();
    }
    async getInvestmentSummary(userId) {
        return this.db
            .selectFrom("investment_summary")
            .select(["as_of_month", "total_invested", "total_current_value", "total_unrealized_gain", "currency", "investment_info"])
            .where("user_id", "=", userId)
            .orderBy("as_of_month", "desc")
            .execute();
    }
    async getLatestTreasuryDecisionSnapshot(userId) {
        return this.db
            .selectFrom("treasury_decision_snapshots")
            .select([
            "snapshot_date",
            "weekly_outflow_baseline",
            "midweek_inflow_baseline",
            "late_inflow_count_last_4_weeks",
            "comfort_threshold",
            "min_inflow_for_midweek_release",
            "release_condition_hit_rate_10_weeks",
            "currency",
            "metadata",
        ])
            .where("user_id", "=", userId)
            .orderBy("snapshot_date", "desc")
            .executeTakeFirst()
            .then((r) => r ? ({
            snapshotDate: String(r.snapshot_date),
            weeklyOutflowBaseline: Number(r.weekly_outflow_baseline),
            midweekInflowBaseline: Number(r.midweek_inflow_baseline),
            lateInflowCountLast4Weeks: Number(r.late_inflow_count_last_4_weeks),
            comfortThreshold: Number(r.comfort_threshold),
            minInflowForMidweekRelease: r.min_inflow_for_midweek_release == null ? null : Number(r.min_inflow_for_midweek_release),
            releaseConditionHitRate10Weeks: r.release_condition_hit_rate_10_weeks == null ? null : Number(r.release_condition_hit_rate_10_weeks),
            currency: String(r.currency),
            metadata: r.metadata,
        }) : undefined);
    }
    async getTreasurySupplierCandidates(userId) {
        return this.db
            .selectFrom("treasury_supplier_payment_candidates")
            .select([
            "supplier_ref",
            "supplier_name",
            "amount",
            "currency",
            "urgency",
            "due_date",
            "batch_hint",
            "metadata",
        ])
            .where("user_id", "=", userId)
            .orderBy("due_date", "asc")
            .execute()
            .then((rows) => rows.map((r) => ({
            supplierRef: r.supplier_ref,
            supplierName: r.supplier_name,
            amount: Number(r.amount),
            currency: String(r.currency),
            urgency: r.urgency,
            dueDate: r.due_date == null ? null : String(r.due_date),
            batchHint: r.batch_hint,
            metadata: r.metadata,
        })));
    }
    async getRecentTreasuryCashflow(userId, days) {
        return this.db
            .selectFrom("treasury_cashflow_daily")
            .select([
            "business_date",
            "day_name",
            "total_inflows",
            "total_outflows",
            "payroll_outflow",
            "supplier_outflow",
            "closing_balance",
            "currency",
            "metadata",
        ])
            .where("user_id", "=", userId)
            .orderBy("business_date", "desc")
            .limit(Math.max(1, days))
            .execute()
            .then((rows) => rows.map((r) => ({
            businessDate: String(r.business_date),
            dayName: r.day_name,
            totalInflows: Number(r.total_inflows),
            totalOutflows: Number(r.total_outflows),
            payrollOutflow: Number(r.payroll_outflow),
            supplierOutflow: Number(r.supplier_outflow),
            closingBalance: r.closing_balance == null ? null : Number(r.closing_balance),
            currency: String(r.currency),
            metadata: r.metadata,
        })));
    }
}
