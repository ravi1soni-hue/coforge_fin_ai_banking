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
    static instance;
    // Infrastructure Layer
    database = DatabaseConnection.getInstance();
    repository = new KyselyFinancialDataRepository(this.database);
    // Application Layer
    applicationService = new FinancialDataApplicationService(this.repository);
    // Infrastructure Layer
    controller = new FinancialDataController(this.applicationService);
    // Presentation Layer
    expressController = new ExpressFinancialDataController(this.controller);
    static getInstance() {
        if (!FinancialDataModule.instance) {
            FinancialDataModule.instance = new FinancialDataModule();
        }
        return FinancialDataModule.instance;
    }
    // Public accessors for external use
    getApplicationService() {
        return this.applicationService;
    }
    getController() {
        return this.controller;
    }
    getExpressController() {
        return this.expressController;
    }
    getRepository() {
        return this.repository;
    }
}
// Export singleton instance
export const financialDataModule = FinancialDataModule.getInstance();
