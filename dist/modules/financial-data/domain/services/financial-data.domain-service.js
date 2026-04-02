export class FinancialDataDomainService {
    /**
     * Calculate total balance across all accounts
     */
    calculateTotalBalance(accounts) {
        return accounts.reduce((total, account) => total + account.balance, 0);
    }
    /**
     * Calculate total monthly expenses from subscriptions
     */
    calculateMonthlyExpenses(subscriptions) {
        return subscriptions.reduce((total, subscription) => {
            switch (subscription.cycle.toLowerCase()) {
                case 'monthly':
                    return total + subscription.amount;
                case 'yearly':
                    return total + (subscription.amount / 12);
                case 'weekly':
                    return total + (subscription.amount * 4.33);
                case 'daily':
                    return total + (subscription.amount * 30);
                default:
                    return total + subscription.amount;
            }
        }, 0);
    }
    /**
     * Calculate total investment value
     */
    calculateTotalInvestments(investments) {
        return investments.reduce((total, investment) => total + investment.currentValue, 0);
    }
    /**
     * Calculate total debt from loans
     */
    calculateTotalDebt(loans) {
        return loans.reduce((total, loan) => total + (loan.emi * loan.remainingTenureMonths), 0);
    }
    /**
     * Calculate savings rate (income - expenses) / income
     */
    calculateSavingsRate(user, subscriptions) {
        const monthlyIncome = user.employment.monthlyIncome;
        const monthlyExpenses = this.calculateMonthlyExpenses(subscriptions);
        if (monthlyIncome === 0)
            return 0;
        return ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;
    }
    /**
     * Get financial health score (0-100)
     */
    calculateFinancialHealthScore(user, accounts, loans, subscriptions, investments) {
        let score = 0;
        // Balance score (30 points)
        const totalBalance = this.calculateTotalBalance(accounts);
        const monthlyIncome = user.employment.monthlyIncome;
        const balanceRatio = totalBalance / monthlyIncome;
        score += Math.min(balanceRatio * 10, 30);
        // Debt score (25 points)
        const totalDebt = this.calculateTotalDebt(loans);
        const debtRatio = totalDebt / monthlyIncome;
        score += Math.max(25 - (debtRatio * 5), 0);
        // Savings rate score (25 points)
        const savingsRate = this.calculateSavingsRate(user, subscriptions);
        score += Math.min(savingsRate * 0.25, 25);
        // Investment score (20 points)
        const totalInvestments = this.calculateTotalInvestments(investments);
        const investmentRatio = totalInvestments / monthlyIncome;
        score += Math.min(investmentRatio * 2, 20);
        return Math.round(Math.min(Math.max(score, 0), 100));
    }
}
