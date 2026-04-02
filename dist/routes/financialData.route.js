import express from "express";
import { saveBankingData, getBankingData, getUserProfile, getFinancialSummary } from "../controllers/financialData.controller.js";
const router = express.Router();
/**
 * Save complete banking data for a user
 * POST /api/financial-data
 */
router.post("/", saveBankingData);
/**
 * Get complete banking data for a user
 * GET /api/financial-data/:userId
 */
router.get("/:userId", getBankingData);
/**
 * Get user profile only
 * GET /api/financial-data/:userId/profile
 */
router.get("/:userId/profile", getUserProfile);
/**
 * Get financial summary for a user
 * GET /api/financial-data/:userId/summary
 */
router.get("/:userId/summary", getFinancialSummary);
export default router;
