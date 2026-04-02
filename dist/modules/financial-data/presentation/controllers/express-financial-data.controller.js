/**
 * Express route handlers for financial data endpoints
 */
export class ExpressFinancialDataController {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    saveBankingData = async (req, res) => {
        await this.controller.saveBankingData(req, res);
    };
    getBankingData = async (req, res) => {
        await this.controller.getBankingData(req, res);
    };
    getUserProfile = async (req, res) => {
        await this.controller.getUserProfile(req, res);
    };
    getFinancialSummary = async (req, res) => {
        await this.controller.getFinancialSummary(req, res);
    };
}
