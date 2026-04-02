import { FinancialDataRepository } from '../../domain/repositories/financial-data.repository.js';
import { User } from '../../domain/entities/user.js';

export class GetUserProfileUseCase {
  constructor(
    private readonly financialDataRepository: FinancialDataRepository
  ) {}

  async execute(userId: string): Promise<User | null> {
    return await this.financialDataRepository.getUser(userId);
  }
}