import { User } from '../entities/user.js';
import { Account } from '../entities/account.js';
import { Loan } from '../entities/loan.js';
import { Subscription } from '../entities/subscription.js';
import { Investment } from '../entities/investment.js';
import { Transaction } from '../entities/transaction.js';
import { SavingsGoal } from '../entities/savings-goal.js';

export interface BankingData {
  userProfile: User;
  accounts: Account[];
  loans: Loan[];
  subscriptions: Subscription[];
  investments: Investment[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
}

export interface FinancialDataRepository {
  saveUser(user: User): Promise<void>;
  getUser(userId: string): Promise<User | null>;
  saveAccounts(accounts: Account[]): Promise<void>;
  getAccounts(userId: string): Promise<Account[]>;
  saveLoans(loans: Loan[]): Promise<void>;
  getLoans(userId: string): Promise<Loan[]>;
  saveSubscriptions(subscriptions: Subscription[]): Promise<void>;
  getSubscriptions(userId: string): Promise<Subscription[]>;
  saveInvestments(investments: Investment[]): Promise<void>;
  getInvestments(userId: string): Promise<Investment[]>;
  saveTransactions(transactions: Transaction[]): Promise<void>;
  getTransactions(userId: string): Promise<Transaction[]>;
  saveSavingsGoals(savingsGoals: SavingsGoal[]): Promise<void>;
  getSavingsGoals(userId: string): Promise<SavingsGoal[]>;
  getBankingData(userId: string): Promise<BankingData | null>;
}