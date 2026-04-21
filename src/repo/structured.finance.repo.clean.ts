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


  async getBalances(userId: string): Promise<AccountBalanceDTO[]> {
    console.log(`[StructuredFinancialRepository] getBalances called with userId=${userId}`);
    try {
      const result = await this.db
        .selectFrom("account_balances")
        .select(["account_type", "provider", "balance", "currency", "updated_at"])
        .where("user_id", "=", userId)
        .execute() as unknown as AccountBalanceDTO[];
      console.log(`[StructuredFinancialRepository] getBalances result:`, JSON.stringify(result));
      return result;
    } catch (err) {
      console.error(`[StructuredFinancialRepository] getBalances error:`, err);
      throw err;
    }
  }



  async getLatestTreasuryDecisionSnapshot(userId: string) {
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
    } catch (err) {
      console.error(`[StructuredFinancialRepository] getLatestTreasuryDecisionSnapshot error:`, err);
      throw err;
    }
  }


  async getTreasurySupplierCandidates(userId: string) {
    console.log(`[StructuredFinancialRepository] getTreasurySupplierCandidates called with userId=${userId}`);
    try {
      const result = await this.db
        .selectFrom("treasury_supplier_payment_candidates")
        .selectAll()
        .where("user_id", "=", userId)
        .execute();
      console.log(`[StructuredFinancialRepository] getTreasurySupplierCandidates result:`, JSON.stringify(result));
      return result;
    } catch (err) {
      console.error(`[StructuredFinancialRepository] getTreasurySupplierCandidates error:`, err);
      throw err;
    }
  }


  async getRecentTreasuryCashflow(userId: string, days = 90) {
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
    } catch (err) {
      console.error(`[StructuredFinancialRepository] getRecentTreasuryCashflow error:`, err);
      throw err;
    }
  }
}
