import { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface UsersTable {
  user_id: string;
  name: string;
  currency: string;
  country: string;
  employment: string; // JSON string
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountsTable {
  account_id: string;
  user_id: string;
  type: string;
  bank: string;
  balance: number;
  average_monthly_balance: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LoansTable {
  loan_id: string;
  user_id: string;
  type: string;
  provider: string;
  emi: number;
  remaining_tenure_months: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SubscriptionsTable {
  id: Generated<number>;
  user_id: string;
  name: string;
  amount: number;
  cycle: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface InvestmentsTable {
  id: Generated<number>;
  user_id: string;
  type: string;
  provider: string;
  current_value: number;
  monthly_contribution: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TransactionsTable {
  id: Generated<number>;
  user_id: string;
  date: string; // Changed from Date to string to match input
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number;
  created_at: Generated<Date>;
}

export interface SavingsGoalsTable {
  goal_id: string;
  user_id: string;
  target_amount: number;
  target_date: string; // Changed from Date to string to match input
  current_saved: number;
  status: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  accounts: AccountsTable;
  loans: LoansTable;
  subscriptions: SubscriptionsTable;
  investments: InvestmentsTable;
  transactions: TransactionsTable;
  savings_goals: SavingsGoalsTable;
}