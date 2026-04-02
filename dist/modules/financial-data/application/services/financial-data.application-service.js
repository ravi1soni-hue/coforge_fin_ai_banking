import { FinancialDataDomainService } from '../../domain/services/financial-data.domain-service.js';
import { SaveBankingDataUseCase } from '../use-cases/save-banking-data.use-case.js';
import { GetBankingDataUseCase } from '../use-cases/get-banking-data.use-case.js';
import { GetUserProfileUseCase } from '../use-cases/get-user-profile.use-case.js';
export class FinancialDataApplicationService {
    saveBankingDataUseCase;
    getBankingDataUseCase;
    getUserProfileUseCase;
    domainService;
    constructor(financialDataRepository) {
        this.saveBankingDataUseCase = new SaveBankingDataUseCase(financialDataRepository);
        this.getBankingDataUseCase = new GetBankingDataUseCase(financialDataRepository);
        this.getUserProfileUseCase = new GetUserProfileUseCase(financialDataRepository);
        this.domainService = new FinancialDataDomainService();
    }
    async saveBankingData(bankingData) {
        await this.saveBankingDataUseCase.execute(bankingData);
    }
    async getBankingData(userId) {
        return await this.getBankingDataUseCase.execute(userId);
    }
    async getUserProfile(userId) {
        return await this.getUserProfileUseCase.execute(userId);
    }
    async getFinancialSummary(userId) {
        const bankingData = await this.getBankingData(userId);
        if (!bankingData)
            return null;
        const { userProfile, accounts, loans, subscriptions, investments } = bankingData;
        return {
            totalBalance: this.domainService.calculateTotalBalance(accounts),
            totalDebt: this.domainService.calculateTotalDebt(loans),
            monthlyExpenses: this.domainService.calculateMonthlyExpenses(subscriptions),
            totalInvestments: this.domainService.calculateTotalInvestments(investments),
            savingsRate: this.domainService.calculateSavingsRate(userProfile, subscriptions),
            financialHealthScore: this.domainService.calculateFinancialHealthScore(userProfile, accounts, loans, subscriptions, investments)
        };
    }
}
