import { Request, Response } from 'express';
import { FinancialDataApplicationService } from '../../application/services/financial-data.application-service.js';
import { BankingData } from '../../domain/repositories/financial-data.repository.js';

export class FinancialDataController {
  constructor(
    private readonly financialDataApplicationService: FinancialDataApplicationService
  ) {}

  async saveBankingData(req: Request, res: Response): Promise<void> {
    try {
      const bankingData: BankingData = req.body;

      if (!bankingData.userProfile?.userId) {
        res.status(400).json({ error: "User ID is required in userProfile" });
        return;
      }

      await this.financialDataApplicationService.saveBankingData(bankingData);

      res.json({
        status: "success",
        message: "Banking data saved successfully"
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async getBankingData(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      const data = await this.financialDataApplicationService.getBankingData(userId);

      if (!data) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async getUserProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      const user = await this.financialDataApplicationService.getUserProfile(userId);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async getFinancialSummary(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      const summary = await this.financialDataApplicationService.getFinancialSummary(userId);

      if (!summary) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
}