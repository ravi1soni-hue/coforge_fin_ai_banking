export class GetUserProfileUseCase {
    financialDataRepository;
    constructor(financialDataRepository) {
        this.financialDataRepository = financialDataRepository;
    }
    async execute(userId) {
        return await this.financialDataRepository.getUser(userId);
    }
}
