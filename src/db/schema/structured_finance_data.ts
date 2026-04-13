import { Generated, Selectable, Insertable, Updateable } from "kysely";

export interface AccountBalancesTable {
  id: Generated<string>;
  user_id: string;
  account_type: string | null;
  provider: string | null;
  account_ref: string | null;
  balance: number;
  currency: string;
  metadata: unknown;
  updated_at: string;
}

export type AccountBalance = Selectable<AccountBalancesTable>;
export type NewAccountBalance = Insertable<AccountBalancesTable>;

export interface FinancialSummaryMonthlyTable {
  id: Generated<string>;
  user_id: string;
  month: string; // DATE (YYYY-MM-DD)
  total_income: number | null;
  total_expenses: number | null;
  total_savings: number | null;
  total_investments: number | null;
  net_cashflow: number | null;
  currency: string;
  metadata: unknown;
  created_at: string;
}

export interface LoanAccountsTable {
  id: Generated<string>;
  user_id: string;
  loan_type: string | null;
  provider: string | null;
  principal_amount: number;
  outstanding_amount: number;
  interest_rate: number | null;
  emi_amount: number | null;
  tenure_months: number | null;
  status: 1 | 2 | 3;
  currency: string;
  metadata: unknown;
  updated_at: string;
}

export interface InvestmentSummaryTable {
  id: Generated<string>;
  user_id: string;
  as_of_month: string;
  total_invested: number;
  total_current_value: number;
  total_unrealized_gain: number | null;
  currency: string;
  investment_info: unknown | null;
  metadata: unknown;
  updated_at: Generated<string>;
}

export type InvestmentSummary = Selectable<InvestmentSummaryTable>;
export type NewInvestmentSummary = Insertable<InvestmentSummaryTable>;

export interface CreditProfileTable {
  user_id: string;
  credit_score: number | null;
  score_band: string | null;
  bureau: string | null;
  last_reported_at: string;
  metadata: unknown;
}

export interface TreasuryCashflowDailyTable {
  id: Generated<string>;
  user_id: string;
  business_date: string;
  day_name: string | null;
  total_inflows: number;
  total_outflows: number;
  payroll_outflow: number;
  supplier_outflow: number;
  closing_balance: number | null;
  currency: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface TreasuryDecisionSnapshotsTable {
  id: Generated<string>;
  user_id: string;
  snapshot_date: string;
  weekly_outflow_baseline: number;
  midweek_inflow_baseline: number;
  late_inflow_count_last_4_weeks: number;
  comfort_threshold: number;
  min_inflow_for_midweek_release: number | null;
  release_condition_hit_rate_10_weeks: number | null;
  currency: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface TreasurySupplierPaymentCandidatesTable {
  id: Generated<string>;
  user_id: string;
  supplier_ref: string | null;
  supplier_name: string;
  amount: number;
  currency: string;
  urgency: "URGENT" | "DEFERABLE";
  due_date: string | null;
  batch_hint: "T0" | "T1" | "T2" | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface TreasuryAccountTransactionsTable {
  id: Generated<string>;
  user_id: string;
  account_ref: string;
  txn_ref: string;
  txn_date: string;
  direction: "CREDIT" | "DEBIT";
  category: string;
  amount: number;
  currency: string;
  counterparty: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}
