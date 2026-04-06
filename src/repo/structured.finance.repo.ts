import { Kysely, sql, Insertable } from 'kysely';
import { Database } from '../db/schema/index.js';


export interface AccountBalanceUpsertDTO {
    userId: string;
    accountType: string | null;
    provider: string | null;
    accountRef: string | null;
  
    balance: number;
    currency: string;
  
    metadata?: unknown;
  }
  
  export interface FinancialSummaryMonthlyUpsertDTO {
    userId: string;
    month: string; // YYYY-MM-01
  
    totalIncome?: number;
    totalExpenses?: number;
    totalSavings?: number;
    totalInvestments?: number;
    netCashflow?: number;
  
    currency: string;
    metadata?: unknown;
  }
  
  export interface LoanAccountUpsertDTO {
    userId: string;
  
    loanType: string;
    provider: string | null;
  
    principalAmount: number;
    outstandingAmount: number;
    interestRate?: number;
    emiAmount?: number;
    tenureMonths?: number;
  
    status: 1 | 2 | 3; // ACTIVE / CLOSED / DEFAULTED
    currency: string;
  
    metadata?: unknown;
  }
  
  export interface CreditProfileUpsertDTO {
    userId: string;
  
    creditScore: number|null;
    scoreBand: string;
    bureau?: string;
  
    metadata?: unknown;
  }

  // dto/read.ts

export interface AccountBalanceDTO {
    accountType: string | null;
    provider: string | null;
    balance: number;
    currency: string;
    updatedAt: string;
  }
  
  export interface FinancialSummaryMonthlyDTO {
    month: string;
  
    totalIncome: number | null;
    totalExpenses: number | null;
    totalSavings: number | null;
    totalInvestments: number | null;
    netCashflow: number | null;
  
    currency: string;
  }
  
  export interface LoanAccountDTO {
    loanType: string|null;
    provider: string | null;
    outstandingAmount: number;
    emiAmount: number | null;
    status: 1 | 2 | 3;
    currency: string;
  }
  
  export interface CreditProfileDTO {
    creditScore: number|null;
    scoreBand: string|null;
    bureau: string | null;
  }

  // dto/write.ts
export interface InvestmentSummaryUpsertDTO {
    userId: string;
    asOfMonth: string; // YYYY-MM-01
    totalInvested: number;
    totalCurrentValue: number;
    totalUnrealizedGain?: number;
    currency: string;
    investmentInfo?: any; // Unstructured data
    metadata?: any;
  }
  
  // dto/read.ts
  export interface InvestmentSummaryDTO {
    asOfMonth: string;
    totalInvested: number;
    totalCurrentValue: number;
    totalUnrealizedGain: number | null;
    currency: string;
    investmentInfo: any;
  }
  

  export class StructuredFinancialRepository {
    private readonly db: Kysely<Database>;
  constructor({
    db,
  }: {
    db: Kysely<Database>;
  }) {
    this.db = db;
  }
  
    async syncAllFinancialData(params: {
      balances: AccountBalanceUpsertDTO[];
      monthlySummary: FinancialSummaryMonthlyUpsertDTO;
      investments: InvestmentSummaryUpsertDTO; // Added this
      loans?: LoanAccountUpsertDTO[];
      creditProfile?: CreditProfileUpsertDTO;
    }) {
      return this.db.transaction().execute(async (trx) => {
  
        /* ---------- 1. Balances ---------- */
        if (params.balances.length) {
          await trx
            .insertInto("account_balances")
            .values(params.balances.map(b => ({
              user_id: b.userId,
              account_type: b.accountType,
              provider: b.provider,
              account_ref: b.accountRef,
              balance: b.balance,
              currency: b.currency,
              metadata: b.metadata ?? {},
              updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            })))
            .onConflict(oc => oc.columns(["user_id", "account_ref"]).doUpdateSet({
              balance: eb => eb.ref("excluded.balance"),
              metadata: (eb: any) => eb.ref("excluded.metadata"),
              updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            }))
            .execute();
        }
  
        /* ---------- 2. Monthly Summary ---------- */
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
          .onConflict(oc => oc.columns(["user_id", "month"]).doUpdateSet({
            total_income: eb => eb.ref("excluded.total_income"),
            total_expenses: eb => eb.ref("excluded.total_expenses"),
            net_cashflow: eb => eb.ref("excluded.net_cashflow"),
            metadata:( eb:any) => eb.ref("excluded.metadata"),
          }))
          .execute();
  
        /* ---------- 3. Investments (The Fix) ---------- */
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
          .onConflict(oc => oc.columns(["user_id", "as_of_month"]).doUpdateSet({
            total_invested: eb => eb.ref("excluded.total_invested"),
            total_current_value: eb => eb.ref("excluded.total_current_value"),
            total_unrealized_gain: eb => eb.ref("excluded.total_unrealized_gain"),
            investment_info:( eb:any) => eb.ref("excluded.investment_info"),
            updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
          }))
          .execute();
  
        /* ---------- 4. Loans (Fixed Typos) ---------- */
        if (params.loans?.length) {
          await trx
            .insertInto("loan_accounts")
            .values(params.loans.map(l => ({
              user_id: l.userId,
              loan_type: l.loanType,
              provider: l.provider,
              principal_amount: l.principalAmount,
              outstanding_amount: l.outstandingAmount,
              interest_rate: l.interestRate ?? null,
              emi_amount: l.emiAmount ?? null,
              tenure_months: l.tenureMonths ?? null,
              status: l.status, // Fixed from 'статус'
              currency: l.currency,
              metadata: l.metadata ?? {},
              updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            })))
            .onConflict(oc => oc.columns(["user_id", "provider", "loan_type"]).doUpdateSet({
              outstanding_amount: eb => eb.ref("excluded.outstanding_amount"),
              emi_amount: eb => eb.ref("excluded.emi_amount"),
              status: eb => eb.ref("excluded.status"),
              updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            }))
            .execute();
        }
  
        /* ---------- 5. Credit Profile ---------- */
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
            .onConflict(oc => oc.column("user_id").doUpdateSet({
              credit_score: eb => eb.ref("excluded.credit_score"),
              score_band: eb => eb.ref("excluded.score_band"),
              last_reported_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
            }))
            .execute();
        }
      });
    }
  
    // Read Method for Investment
    async getInvestmentSummary(userId: string): Promise<InvestmentSummaryDTO[]> {
      return this.db
        .selectFrom("investment_summary")
        .select([
          "as_of_month as asOfMonth",
          "total_invested as totalInvested",
          "total_current_value as totalCurrentValue",
          "total_unrealized_gain as totalUnrealizedGain",
          "currency",
          "investment_info as investmentInfo"
        ])
        .where("user_id", "=", userId)
        .orderBy("as_of_month", "desc")
        .execute();
    }

      /* =====================================================
   * READ APIs (read boundary)
   * ===================================================== */

  async getBalances(userId: string): Promise<AccountBalanceDTO[]> {
    return this.db
      .selectFrom("account_balances")
      .select([
        "account_type as accountType",
        "provider",
        "balance",
        "currency",
        "updated_at as updatedAt",
      ])
      .where("user_id", "=", userId)
      .execute();
  }

  async getMonthlySummary(
    userId: string,
    month: string
  ): Promise<FinancialSummaryMonthlyDTO | undefined> {
    return this.db
      .selectFrom("financial_summary_monthly")
      .select([
        "month",
        "total_income as totalIncome",
        "total_expenses as totalExpenses",
        "total_savings as totalSavings",
        "total_investments as totalInvestments",
        "net_cashflow as netCashflow",
        "currency",
      ])
      .where("user_id", "=", userId)
      .where("month", "=", month)
      .executeTakeFirst();
  }

  async getActiveLoans(userId: string): Promise<LoanAccountDTO[]> {
    return this.db
      .selectFrom("loan_accounts")
      .select([
        "loan_type as loanType",
        "provider",
        "outstanding_amount as outstandingAmount",
        "emi_amount as emiAmount",
        "status",
        "currency",
      ])
      .where("user_id", "=", userId)
      .where("status", "=", 1) // ACTIVE
      .execute();
  }

  async getCreditProfile(userId: string): Promise<CreditProfileDTO | undefined> {
    return this.db
      .selectFrom("credit_profile")
      .select([
        "credit_score as creditScore",
        "score_band as scoreBand",
        "bureau",
      ])
      .where("user_id", "=", userId)
      .executeTakeFirst();
  }
  }
  






