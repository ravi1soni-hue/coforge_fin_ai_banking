export class SaveBankingDataUseCase {
    financialDataRepository;
    constructor(financialDataRepository) {
        this.financialDataRepository = financialDataRepository;
    }
    async execute(bankingData) {
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
