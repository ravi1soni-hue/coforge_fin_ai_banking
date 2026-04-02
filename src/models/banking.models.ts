export interface User {
  user_id: string;
  name: string;
  currency: string;
  country: string;
  employment: {
    type: string;
    monthlyIncome: number;
    salaryCreditDay: number;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Account {
  account_id: string;
  user_id: string;
  type: string;
  bank: string;
  balance: number;
  average_monthly_balance: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Loan {
  loan_id: string;
  user_id: string;
  type: string;
  provider: string;
  emi: number;
  remaining_tenure_months: number;
  created_at?: string;
  updated_at?: string;
}

export interface Subscription {
  id?: number;
  user_id: string;
  name: string;
  amount: number;
  cycle: string;
  created_at?: string;
  updated_at?: string;
}

export interface Investment {
  id?: number;
  user_id: string;
  type: string;
  provider: string;
  current_value: number;
  monthly_contribution: number;
  created_at?: string;
  updated_at?: string;
}

export interface Transaction {
  id?: number;
  user_id: string;
  date: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number;
  created_at?: string;
}

export interface SavingsGoal {
  goal_id: string;
  user_id: string;
  target_amount: number;
  target_date: string;
  current_saved: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface BankingData {
  userProfile: User;
  accounts: Account[];
  loans: Loan[];
  subscriptions: Subscription[];
  investments: Investment[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
}