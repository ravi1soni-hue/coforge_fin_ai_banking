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
