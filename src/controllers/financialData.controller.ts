import { Request, Response } from "express";
import { financialDataModule } from "../modules/financial-data/financial-data.module.js";

/**
 * Save banking data for a user
 */
export const saveBankingData = async (req: Request, res: Response): Promise<void> => {
  const controller = financialDataModule.getExpressController();
  await controller.saveBankingData(req, res);
};

/**
 * Get complete banking data for a user
 */
export const getBankingData = async (req: Request, res: Response): Promise<void> => {
  const controller = financialDataModule.getExpressController();
  await controller.getBankingData(req, res);
};

/**
 * Get user profile only
 */
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  const controller = financialDataModule.getExpressController();
  await controller.getUserProfile(req, res);
};

/**
 * Get financial summary for a user
 */
export const getFinancialSummary = async (req: Request, res: Response): Promise<void> => {
  const controller = financialDataModule.getExpressController();
  await controller.getFinancialSummary(req, res);
};