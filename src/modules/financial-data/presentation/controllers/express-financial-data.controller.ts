import { Request, Response } from 'express';
import { FinancialDataController } from '../../infrastructure/controllers/financial-data.controller.js';

/**
 * Express route handlers for financial data endpoints
 */
export class ExpressFinancialDataController {
  constructor(private readonly controller: FinancialDataController) {}

  saveBankingData = async (req: Request, res: Response): Promise<void> => {
    await this.controller.saveBankingData(req, res);
  };

  getBankingData = async (req: Request, res: Response): Promise<void> => {
    await this.controller.getBankingData(req, res);
  };

  getUserProfile = async (req: Request, res: Response): Promise<void> => {
    await this.controller.getUserProfile(req, res);
  };

  getFinancialSummary = async (req: Request, res: Response): Promise<void> => {
    await this.controller.getFinancialSummary(req, res);
  };
}