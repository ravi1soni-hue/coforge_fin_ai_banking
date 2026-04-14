import { Kysely, sql } from "kysely";
import { Database } from "../db/schema/index.js";

export interface AccountBalanceUpsertDTO {
  userId: string;
  accountType: string | null;
  provider: string | null;
  accountRef: string | null;
  balance: number;
  currency: string;
  metadata?: unknown;
}

// Removed FinancialSummaryMonthlyUpsertDTO (retail/personal)

export interface LoanAccountUpsertDTO {
  userId: string;
  loanType: string;
  provider: string | null;
  principalAmount: number;
  outstandingAmount: number;
  interestRate?: number;
  emiAmount?: number;
  tenureMonths?: number;
  status: 1 | 2 | 3;
  currency: string;
  metadata?: unknown;
}

export interface CreditProfileUpsertDTO {
  userId: string;
  creditScore: number | null;
  scoreBand: string;
  bureau?: string;
  metadata?: unknown;
}

export interface InvestmentSummaryUpsertDTO {
  userId: string;
  asOfMonth: string;
  totalInvested: number;
  totalCurrentValue: number;
  totalUnrealizedGain?: number;
  currency: string;
  investmentInfo?: unknown;
  metadata?: unknown;
}

export interface AccountBalanceDTO {
  accountType: string | null;
  provider: string | null;
  balance: number;
  currency: string;
  updatedAt: string;
}

// Removed FinancialSummaryMonthlyDTO (retail/personal)

export interface LoanAccountDTO {
  loanType: string | null;
  provider: string | null;
  outstandingAmount: number;
  emiAmount: number | null;
  status: 1 | 2 | 3;
  currency: string;
}

export interface CreditProfileDTO {
  creditScore: number | null;
  scoreBand: string | null;
  bureau: string | null;
}

export interface InvestmentSummaryDTO {
  asOfMonth: string;
  totalInvested: number;
  totalCurrentValue: number;
  totalUnrealizedGain: number | null;
  currency: string;
  investmentInfo: unknown;
}

export interface TreasuryDecisionSnapshotDTO {
  snapshotDate: string;
  weeklyOutflowBaseline: number;
  midweekInflowBaseline: number;
  lateInflowCountLast4Weeks: number;
  comfortThreshold: number;
  minInflowForMidweekRelease: number | null;
  releaseConditionHitRate10Weeks: number | null;
  currency: string;
  metadata: unknown;
}

export interface TreasurySupplierCandidateDTO {
  supplierRef: string | null;
  supplierName: string;
  amount: number;
  currency: string;
  urgency: "URGENT" | "DEFERABLE";
  dueDate: string | null;
  batchHint: "T0" | "T1" | "T2" | null;
  metadata: unknown;
}

export interface TreasuryCashflowDailyDTO {
  businessDate: string;
  dayName: string | null;
  totalInflows: number;
  totalOutflows: number;
  payrollOutflow: number;
  supplierOutflow: number;
  closingBalance: number | null;
  currency: string;
  metadata: unknown;
}

export class StructuredFinancialRepository {
  private readonly db: Kysely<Database>;

  constructor({ db }: { db: Kysely<Database> }) {
    this.db = db;
  }

  async syncAllFinancialData(params: {
    balances: AccountBalanceUpsertDTO[];
    monthlySummary: FinancialSummaryMonthlyUpsertDTO;
    investments: InvestmentSummaryUpsertDTO;
    loans?: LoanAccountUpsertDTO[];
    creditProfile?: CreditProfileUpsertDTO;
  }) {
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
            updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
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
          created_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
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
          updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
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
            updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
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
            last_reported_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
          })
          .execute();
      }
    });
  }

  async getBalances(userId: string): Promise<AccountBalanceDTO[]> {
    return this.db
      .selectFrom("account_balances")
      .select(["account_type", "provider", "balance", "currency", "updated_at"])
      .where("user_id", "=", userId)
      .execute() as unknown as AccountBalanceDTO[];
  }

// Removed getMonthlySummary and getLatestMonthlySummary (retail/personal)

  async getActiveLoans(userId: string): Promise<LoanAccountDTO[]> {
    return this.db
    // Removed syncAllFinancialData (retail/personal)
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
