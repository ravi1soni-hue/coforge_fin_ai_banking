export class GetBankingDataUseCase {
    financialDataRepository;
    constructor(financialDataRepository) {
        this.financialDataRepository = financialDataRepository;
    }
    async execute(userId) {
        return await this.financialDataRepository.getBankingData(userId);
    }
}
