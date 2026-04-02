import { Kysely } from 'kysely';
import { FinancialDataRepository, BankingData } from '../../domain/repositories/financial-data.repository.js';
import { User } from '../../domain/entities/user.js';
import { Account } from '../../domain/entities/account.js';
import { Loan } from '../../domain/entities/loan.js';
import { Subscription } from '../../domain/entities/subscription.js';
import { Investment } from '../../domain/entities/investment.js';
import { Transaction } from '../../domain/entities/transaction.js';
import { SavingsGoal } from '../../domain/entities/savings-goal.js';
import type { Database } from '../../../../models/database.types.js';

export class KyselyFinancialDataRepository implements FinancialDataRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async saveUser(user: User): Promise<void> {
    await this.db
      .insertInto('users')
      .values({
        user_id: user.userId,
        name: user.name,
        currency: user.currency,
        country: user.country,
        employment: JSON.stringify(user.employment)
      })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({
        name: user.name,
        currency: user.currency,
        country: user.country,
        employment: JSON.stringify(user.employment),
        updated_at: new Date()
      }))
      .execute();
  }

  async getUser(userId: string): Promise<User | null> {
    const user = await this.db
      .selectFrom('users')
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!user) return null;

    let employment;
    try {
      // Handle both string and object employment fields
      if (typeof user.employment === 'string') {
        employment = JSON.parse(user.employment);
      } else if (user.employment && typeof user.employment === 'object') {
        employment = user.employment;
      } else {
        employment = {};
      }
    } catch (error) {
      console.error('Error parsing employment JSON:', error);
      employment = {};
    }

    return new User(
      user.user_id,
      user.name,
      user.currency,
      user.country,
      employment,
      user.created_at || undefined,
      user.updated_at || undefined
    );
  }

  async saveAccounts(accounts: Account[]): Promise<void> {
    const accountsData = accounts.map(account => ({
      account_id: account.accountId,
      user_id: account.userId,
      type: account.type,
      bank: account.bank,
      balance: account.balance,
      average_monthly_balance: account.averageMonthlyBalance
    }));

    await this.db
      .insertInto('accounts')
      .values(accountsData)
      .onConflict((oc) => oc.column('account_id').doUpdateSet((eb) => ({
        type: eb.ref('excluded.type'),
        bank: eb.ref('excluded.bank'),
        balance: eb.ref('excluded.balance'),
        average_monthly_balance: eb.ref('excluded.average_monthly_balance'),
        updated_at: new Date()
      })))
      .execute();
  }

  async getAccounts(userId: string): Promise<Account[]> {
    const accounts = await this.db
      .selectFrom('accounts')
      .where('user_id', '=', userId)
      .selectAll()
      .execute();

    return accounts.map(account =>
      new Account(
        account.account_id,
        account.user_id,
        account.type,
        account.bank,
        account.balance,
        account.average_monthly_balance,
        account.created_at || undefined,
        account.updated_at || undefined
      )
    );
  }

  async saveLoans(loans: Loan[]): Promise<void> {
    const loansData = loans.map(loan => ({
      loan_id: loan.loanId,
      user_id: loan.userId,
      type: loan.type,
      provider: loan.provider,
      emi: loan.emi,
      remaining_tenure_months: loan.remainingTenureMonths
    }));

    await this.db
      .insertInto('loans')
      .values(loansData)
      .onConflict((oc) => oc.column('loan_id').doUpdateSet((eb) => ({
        type: eb.ref('excluded.type'),
        provider: eb.ref('excluded.provider'),
        emi: eb.ref('excluded.emi'),
        remaining_tenure_months: eb.ref('excluded.remaining_tenure_months'),
        updated_at: new Date()
      })))
      .execute();
  }

  async getLoans(userId: string): Promise<Loan[]> {
    const loans = await this.db
      .selectFrom('loans')
      .where('user_id', '=', userId)
      .selectAll()
      .execute();

    return loans.map(loan =>
      new Loan(
        loan.loan_id,
        loan.user_id,
        loan.type,
        loan.provider,
        loan.emi,
        loan.remaining_tenure_months,
        loan.created_at || undefined,
        loan.updated_at || undefined
      )
    );
  }

  async saveSubscriptions(subscriptions: Subscription[]): Promise<void> {
    const subscriptionsData = subscriptions.map(sub => ({
      user_id: sub.userId,
      name: sub.name,
      amount: sub.amount,
      cycle: sub.cycle
    }));

    await this.db
      .insertInto('subscriptions')
      .values(subscriptionsData)
      .execute();
  }

  async getSubscriptions(userId: string): Promise<Subscription[]> {
    const subscriptions = await this.db
      .selectFrom('subscriptions')
      .where('user_id', '=', userId)
      .selectAll()
      .execute();

    return subscriptions.map(sub =>
      new Subscription(
        sub.id,
        sub.user_id,
        sub.name,
        sub.amount,
        sub.cycle,
        sub.created_at || undefined,
        sub.updated_at || undefined
      )
    );
  }

  async saveInvestments(investments: Investment[]): Promise<void> {
    const investmentsData = investments.map(inv => ({
      user_id: inv.userId,
      type: inv.type,
      provider: inv.provider,
      current_value: inv.currentValue,
      monthly_contribution: inv.monthlyContribution
    }));

    await this.db
      .insertInto('investments')
      .values(investmentsData)
      .execute();
  }

  async getInvestments(userId: string): Promise<Investment[]> {
    const investments = await this.db
      .selectFrom('investments')
      .where('user_id', '=', userId)
      .selectAll()
      .execute();

    return investments.map(inv =>
      new Investment(
        inv.id,
        inv.user_id,
        inv.type,
        inv.provider,
        inv.current_value,
        inv.monthly_contribution,
        inv.created_at || undefined,
        inv.updated_at || undefined
      )
    );
  }

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    const transactionsData = transactions.map(tx => ({
      user_id: tx.userId,
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount
    }));

    await this.db
      .insertInto('transactions')
      .values(transactionsData)
      .execute();
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    const transactions = await this.db
      .selectFrom('transactions')
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(1000)
      .selectAll()
      .execute();

    return transactions.map(tx =>
      new Transaction(
        tx.id,
        tx.user_id,
        tx.date,
        tx.type as any,
        tx.category,
        tx.amount,
        tx.created_at || undefined
      )
    );
  }

  async saveSavingsGoals(savingsGoals: SavingsGoal[]): Promise<void> {
    const goalsData = savingsGoals.map(goal => ({
      goal_id: goal.goalId,
      user_id: goal.userId,
      target_amount: goal.targetAmount,
      target_date: goal.targetDate,
      current_saved: goal.currentSaved,
      status: goal.status
    }));

    await this.db
      .insertInto('savings_goals')
      .values(goalsData)
      .onConflict((oc) => oc.column('goal_id').doUpdateSet((eb) => ({
        target_amount: eb.ref('excluded.target_amount'),
        target_date: eb.ref('excluded.target_date'),
        current_saved: eb.ref('excluded.current_saved'),
        status: eb.ref('excluded.status'),
        updated_at: new Date()
      })))
      .execute();
  }

  async getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
    const savingsGoals = await this.db
      .selectFrom('savings_goals')
      .where('user_id', '=', userId)
      .selectAll()
      .execute();

    return savingsGoals.map(goal =>
      new SavingsGoal(
        goal.goal_id,
        goal.user_id,
        goal.target_amount,
        goal.target_date,
        goal.current_saved,
        goal.status,
        goal.created_at || undefined,
        goal.updated_at || undefined
      )
    );
  }

  async getBankingData(userId: string): Promise<BankingData | null> {
    const user = await this.getUser(userId);
    if (!user) return null;

    const [accounts, loans, subscriptions, investments, transactions, savingsGoals] = await Promise.all([
      this.getAccounts(userId),
      this.getLoans(userId),
      this.getSubscriptions(userId),
      this.getInvestments(userId),
      this.getTransactions(userId),
      this.getSavingsGoals(userId)
    ]);

    return {
      userProfile: user,
      accounts,
      loans,
      subscriptions,
      investments,
      transactions,
      savingsGoals
    };
  }
}