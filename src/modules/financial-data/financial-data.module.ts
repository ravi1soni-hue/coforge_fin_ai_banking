import { FinancialDataApplicationService } from './application/services/financial-data.application-service.js';
import { KyselyFinancialDataRepository } from './infrastructure/repositories/kysely-financial-data.repository.js';
import { FinancialDataController } from './infrastructure/controllers/financial-data.controller.js';
import { ExpressFinancialDataController } from './presentation/controllers/express-financial-data.controller.js';
import { DatabaseConnection } from './infrastructure/external/database/kysely-connection.js';

/**
 * Financial Data Module Composition Root
 * Wires up all dependencies using Dependency Injection
 */
export class FinancialDataModule {
  private static instance: FinancialDataModule;

  // Infrastructure Layer
  private readonly database = DatabaseConnection.getInstance();
  private readonly repository = new KyselyFinancialDataRepository(this.database);

  // Application Layer
  private readonly applicationService = new FinancialDataApplicationService(this.repository);

  // Infrastructure Layer
  private readonly controller = new FinancialDataController(this.applicationService);

  // Presentation Layer
  private readonly expressController = new ExpressFinancialDataController(this.controller);

  static getInstance(): FinancialDataModule {
    if (!FinancialDataModule.instance) {
      FinancialDataModule.instance = new FinancialDataModule();
    }
    return FinancialDataModule.instance;
  }

  // Public accessors for external use
  getApplicationService(): FinancialDataApplicationService {
    return this.applicationService;
  }

  getController(): FinancialDataController {
    return this.controller;
  }

  getExpressController(): ExpressFinancialDataController {
    return this.expressController;
  }

  getRepository(): KyselyFinancialDataRepository {
    return this.repository;
  }
}

// Export singleton instance
export const financialDataModule = FinancialDataModule.getInstance();