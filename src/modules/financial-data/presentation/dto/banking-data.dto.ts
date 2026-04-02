import { User } from '../../domain/entities/user.js';
import { Account } from '../../domain/entities/account.js';
import { Loan } from '../../domain/entities/loan.js';
import { Subscription } from '../../domain/entities/subscription.js';
import { Investment } from '../../domain/entities/investment.js';
import { Transaction } from '../../domain/entities/transaction.js';
import { SavingsGoal } from '../../domain/entities/savings-goal.js';

export interface BankingDataDTO {
  userProfile: {
    user_id: string;
    name: string;
    currency: string;
    country: string;
    employment: {
      type: string;
      monthlyIncome: number;
      salaryCreditDay: number;
    };
  };
  accounts: {
    account_id: string;
    user_id: string;
    type: string;
    bank: string;
    balance: number;
    average_monthly_balance: number | null;
  }[];
  loans: {
    loan_id: string;
    user_id: string;
    type: string;
    provider: string;
    emi: number;
    remaining_tenure_months: number;
  }[];
  subscriptions: {
    user_id: string;
    name: string;
    amount: number;
    cycle: string;
  }[];
  investments: {
    user_id: string;
    type: string;
    provider: string;
    current_value: number;
    monthly_contribution: number;
  }[];
  transactions: {
    user_id: string;
    date: string;
    type: 'CREDIT' | 'DEBIT';
    category: string;
    amount: number;
  }[];
  savingsGoals: {
    goal_id: string;
    user_id: string;
    target_amount: number;
    target_date: string;
    current_saved: number;
    status: string;
  }[];
}

export class BankingDataMapper {
  static toDomain(dto: BankingDataDTO): {
    userProfile: User;
    accounts: Account[];
    loans: Loan[];
    subscriptions: Subscription[];
    investments: Investment[];
    transactions: Transaction[];
    savingsGoals: SavingsGoal[];
  } {
    return {
      userProfile: new User(
        dto.userProfile.user_id,
        dto.userProfile.name,
        dto.userProfile.currency,
        dto.userProfile.country,
        dto.userProfile.employment
      ),
      accounts: dto.accounts.map(account =>
        new Account(
          account.account_id,
          account.user_id,
          account.type,
          account.bank,
          account.balance,
          account.average_monthly_balance
        )
      ),
      loans: dto.loans.map(loan =>
        new Loan(
          loan.loan_id,
          loan.user_id,
          loan.type,
          loan.provider,
          loan.emi,
          loan.remaining_tenure_months
        )
      ),
      subscriptions: dto.subscriptions.map(sub =>
        new Subscription(
          undefined,
          sub.user_id,
          sub.name,
          sub.amount,
          sub.cycle
        )
      ),
      investments: dto.investments.map(inv =>
        new Investment(
          undefined,
          inv.user_id,
          inv.type,
          inv.provider,
          inv.current_value,
          inv.monthly_contribution
        )
      ),
      transactions: dto.transactions.map(tx =>
        new Transaction(
          undefined,
          tx.user_id,
          tx.date,
          tx.type,
          tx.category,
          tx.amount
        )
      ),
      savingsGoals: dto.savingsGoals.map(goal =>
        new SavingsGoal(
          goal.goal_id,
          goal.user_id,
          goal.target_amount,
          goal.target_date,
          goal.current_saved,
          goal.status
        )
      )
    };
  }

  static toDTO(domain: {
    userProfile: User;
    accounts: Account[];
    loans: Loan[];
    subscriptions: Subscription[];
    investments: Investment[];
    transactions: Transaction[];
    savingsGoals: SavingsGoal[];
  }): BankingDataDTO {
    return {
      userProfile: {
        user_id: domain.userProfile.userId,
        name: domain.userProfile.name,
        currency: domain.userProfile.currency,
        country: domain.userProfile.country,
        employment: domain.userProfile.employment
      },
      accounts: domain.accounts.map(account => ({
        account_id: account.accountId,
        user_id: account.userId,
        type: account.type,
        bank: account.bank,
        balance: account.balance,
        average_monthly_balance: account.averageMonthlyBalance
      })),
      loans: domain.loans.map(loan => ({
        loan_id: loan.loanId,
        user_id: loan.userId,
        type: loan.type,
        provider: loan.provider,
        emi: loan.emi,
        remaining_tenure_months: loan.remainingTenureMonths
      })),
      subscriptions: domain.subscriptions.map(sub => ({
        user_id: sub.userId,
        name: sub.name,
        amount: sub.amount,
        cycle: sub.cycle
      })),
      investments: domain.investments.map(inv => ({
        user_id: inv.userId,
        type: inv.type,
        provider: inv.provider,
        current_value: inv.currentValue,
        monthly_contribution: inv.monthlyContribution
      })),
      transactions: domain.transactions.map(tx => ({
        user_id: tx.userId,
        date: tx.date,
        type: tx.type,
        category: tx.category,
        amount: tx.amount
      })),
      savingsGoals: domain.savingsGoals.map(goal => ({
        goal_id: goal.goalId,
        user_id: goal.userId,
        target_amount: goal.targetAmount,
        target_date: goal.targetDate,
        current_saved: goal.currentSaved,
        status: goal.status
      }))
    };
  }
}