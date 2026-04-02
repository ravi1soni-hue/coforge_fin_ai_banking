export class FinancialDataController {
    financialDataApplicationService;
    constructor(financialDataApplicationService) {
        this.financialDataApplicationService = financialDataApplicationService;
    }
    async saveBankingData(req, res) {
        try {
            const bankingData = req.body;
            if (!bankingData.userProfile?.userId) {
                res.status(400).json({ error: "User ID is required in userProfile" });
                return;
            }
            await this.financialDataApplicationService.saveBankingData(bankingData);
            res.json({
                status: "success",
                message: "Banking data saved successfully"
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    }
    async getBankingData(req, res) {
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    }
    async getUserProfile(req, res) {
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    }
    async getFinancialSummary(req, res) {
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    }
}
