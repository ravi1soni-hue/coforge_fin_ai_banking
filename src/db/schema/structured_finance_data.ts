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
