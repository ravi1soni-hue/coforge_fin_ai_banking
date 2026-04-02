import { FinancialDataRepository, BankingData } from '../../domain/repositories/financial-data.repository.js';

export class GetBankingDataUseCase {
  constructor(
    private readonly financialDataRepository: FinancialDataRepository
  ) {}

  async execute(userId: string): Promise<BankingData | null> {
    return await this.financialDataRepository.getBankingData(userId);
  }
}