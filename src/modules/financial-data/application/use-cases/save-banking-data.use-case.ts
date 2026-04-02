import { FinancialDataRepository, BankingData } from '../../domain/repositories/financial-data.repository.js';
import { User } from '../../domain/entities/user.js';
import { Account } from '../../domain/entities/account.js';
import { Loan } from '../../domain/entities/loan.js';
import { Subscription } from '../../domain/entities/subscription.js';
import { Investment } from '../../domain/entities/investment.js';
import { Transaction } from '../../domain/entities/transaction.js';
import { SavingsGoal } from '../../domain/entities/savings-goal.js';

export class SaveBankingDataUseCase {
  constructor(
    private readonly financialDataRepository: FinancialDataRepository
  ) {}

  async execute(bankingData: BankingData): Promise<void> {
    // Convert domain entities to repository format and save
    await this.financialDataRepository.saveUser(bankingData.userProfile);

    if (bankingData.accounts.length > 0) {
      await this.financialDataRepository.saveAccounts(bankingData.accounts);
    }

    if (bankingData.loans.length > 0) {
      await this.financialDataRepository.saveLoans(bankingData.loans);
    }

    if (bankingData.subscriptions.length > 0) {
      await this.financialDataRepository.saveSubscriptions(bankingData.subscriptions);
    }

    if (bankingData.investments.length > 0) {
      await this.financialDataRepository.saveInvestments(bankingData.investments);
    }

    if (bankingData.transactions.length > 0) {
      await this.financialDataRepository.saveTransactions(bankingData.transactions);
    }

    if (bankingData.savingsGoals.length > 0) {
      await this.financialDataRepository.saveSavingsGoals(bankingData.savingsGoals);
    }
  }
}