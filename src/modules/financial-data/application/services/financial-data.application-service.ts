import { FinancialDataRepository, BankingData } from '../../domain/repositories/financial-data.repository.js';
import { FinancialDataDomainService } from '../../domain/services/financial-data.domain-service.js';
import { SaveBankingDataUseCase } from '../use-cases/save-banking-data.use-case.js';
import { GetBankingDataUseCase } from '../use-cases/get-banking-data.use-case.js';
import { GetUserProfileUseCase } from '../use-cases/get-user-profile.use-case.js';
import { User } from '../../domain/entities/user.js';

export interface FinancialSummary {
  totalBalance: number;
  totalDebt: number;
  monthlyExpenses: number;
  totalInvestments: number;
  savingsRate: number;
  financialHealthScore: number;
}

export class FinancialDataApplicationService {
  private readonly saveBankingDataUseCase: SaveBankingDataUseCase;
  private readonly getBankingDataUseCase: GetBankingDataUseCase;
  private readonly getUserProfileUseCase: GetUserProfileUseCase;
  private readonly domainService: FinancialDataDomainService;

  constructor(
    financialDataRepository: FinancialDataRepository
  ) {
    this.saveBankingDataUseCase = new SaveBankingDataUseCase(financialDataRepository);
    this.getBankingDataUseCase = new GetBankingDataUseCase(financialDataRepository);
    this.getUserProfileUseCase = new GetUserProfileUseCase(financialDataRepository);
    this.domainService = new FinancialDataDomainService();
  }

  async saveBankingData(bankingData: BankingData): Promise<void> {
    await this.saveBankingDataUseCase.execute(bankingData);
  }

  async getBankingData(userId: string): Promise<BankingData | null> {
    return await this.getBankingDataUseCase.execute(userId);
  }

  async getUserProfile(userId: string): Promise<User | null> {
    return await this.getUserProfileUseCase.execute(userId);
  }

  async getFinancialSummary(userId: string): Promise<FinancialSummary | null> {
    const bankingData = await this.getBankingData(userId);
    if (!bankingData) return null;

    const { userProfile, accounts, loans, subscriptions, investments } = bankingData;

    return {
      totalBalance: this.domainService.calculateTotalBalance(accounts),
      totalDebt: this.domainService.calculateTotalDebt(loans),
      monthlyExpenses: this.domainService.calculateMonthlyExpenses(subscriptions),
      totalInvestments: this.domainService.calculateTotalInvestments(investments),
      savingsRate: this.domainService.calculateSavingsRate(userProfile, subscriptions),
      financialHealthScore: this.domainService.calculateFinancialHealthScore(
        userProfile,
        accounts,
        loans,
        subscriptions,
        investments
      )
    };
  }
}