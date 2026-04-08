import { AccountBalanceDTO, AccountBalanceUpsertDTO, CreditProfileDTO, CreditProfileUpsertDTO, FinancialSummaryMonthlyDTO, FinancialSummaryMonthlyUpsertDTO, InvestmentSummaryDTO, InvestmentSummaryUpsertDTO, LoanAccountDTO, LoanAccountUpsertDTO, StructuredFinancialRepository } from "../repo/structured.finance.repo";


export class StructuredFinancialDataService {

  private readonly financialDataRepo: StructuredFinancialRepository

  constructor({
    financialDataRepo,
  }: {
    financialDataRepo: StructuredFinancialRepository;
  }) {
    this.financialDataRepo = financialDataRepo;
  }

  async getInvestmentSummary(userId: string): Promise<InvestmentSummaryDTO[]> {
    return this.financialDataRepo.getInvestmentSummary(userId);
  }

  

  async getBalances(userId: string): Promise<AccountBalanceDTO[]> {
    return this.financialDataRepo.getBalances(userId);
  }

  async getMonthlySummary(
    userId: string,
    month: string
  ): Promise<FinancialSummaryMonthlyDTO | undefined> {
    return this.financialDataRepo.getMonthlySummary(userId,month);
  }

  async getActiveLoans(userId: string): Promise<LoanAccountDTO[]> {
    return this.financialDataRepo.getActiveLoans(userId)
  }

  async getCreditProfile(userId: string): Promise<CreditProfileDTO | undefined> {
    return this.financialDataRepo.getCreditProfile(userId);
  }


}
