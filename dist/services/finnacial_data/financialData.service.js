import { db } from "../../db.js";
export class FinancialDataService {
    /**
     * Save complete banking data for a user
     */
    async saveBankingData(data) {
        await db.transaction().execute(async (trx) => {
            // Insert user profile
            await trx
                .insertInto('users')
                .values({
                user_id: data.userProfile.user_id,
                name: data.userProfile.name,
                currency: data.userProfile.currency,
                country: data.userProfile.country,
                employment: JSON.stringify(data.userProfile.employment)
            })
                .onConflict((oc) => oc.column('user_id').doUpdateSet({
                name: data.userProfile.name,
                currency: data.userProfile.currency,
                country: data.userProfile.country,
                employment: JSON.stringify(data.userProfile.employment),
                updated_at: new Date()
            }))
                .execute();
            // Insert accounts
            if (data.accounts.length > 0) {
                const accountsData = data.accounts.map(account => ({
                    account_id: account.account_id,
                    user_id: account.user_id,
                    type: account.type,
                    bank: account.bank,
                    balance: account.balance,
                    average_monthly_balance: account.average_monthly_balance
                }));
                await trx
                    .insertInto('accounts')
                    .values(accountsData)
                    .onConflict((oc) => oc.column('account_id').doUpdateSet((eb) => ({
                    type: eb.ref('excluded.type'),
                    bank: eb.ref('excluded.bank'),
                    balance: eb.ref('excluded.balance'),
                    average_monthly_balance: eb.ref('excluded.average_monthly_balance'),
                    updated_at: new Date()
                })))
                    .execute();
            }
            // Insert loans
            if (data.loans.length > 0) {
                const loansData = data.loans.map(loan => ({
                    loan_id: loan.loan_id,
                    user_id: loan.user_id,
                    type: loan.type,
                    provider: loan.provider,
                    emi: loan.emi,
                    remaining_tenure_months: loan.remaining_tenure_months
                }));
                await trx
                    .insertInto('loans')
                    .values(loansData)
                    .onConflict((oc) => oc.column('loan_id').doUpdateSet((eb) => ({
                    type: eb.ref('excluded.type'),
                    provider: eb.ref('excluded.provider'),
                    emi: eb.ref('excluded.emi'),
                    remaining_tenure_months: eb.ref('excluded.remaining_tenure_months'),
                    updated_at: new Date()
                })))
                    .execute();
            }
            // Insert subscriptions
            if (data.subscriptions.length > 0) {
                const subscriptionsData = data.subscriptions.map(sub => ({
                    user_id: sub.user_id,
                    name: sub.name,
                    amount: sub.amount,
                    cycle: sub.cycle
                }));
                await trx
                    .insertInto('subscriptions')
                    .values(subscriptionsData)
                    .execute();
            }
            // Insert investments
            if (data.investments.length > 0) {
                const investmentsData = data.investments.map(inv => ({
                    user_id: inv.user_id,
                    type: inv.type,
                    provider: inv.provider,
                    current_value: inv.current_value,
                    monthly_contribution: inv.monthly_contribution
                }));
                await trx
                    .insertInto('investments')
                    .values(investmentsData)
                    .execute();
            }
            // Insert transactions
            if (data.transactions.length > 0) {
                const transactionsData = data.transactions.map(tx => ({
                    user_id: tx.user_id,
                    date: tx.date,
                    type: tx.type,
                    category: tx.category,
                    amount: tx.amount
                }));
                await trx
                    .insertInto('transactions')
                    .values(transactionsData)
                    .execute();
            }
            // Insert savings goals
            if (data.savingsGoals.length > 0) {
                const goalsData = data.savingsGoals.map(goal => ({
                    goal_id: goal.goal_id,
                    user_id: goal.user_id,
                    target_amount: goal.target_amount,
                    target_date: goal.target_date,
                    current_saved: goal.current_saved,
                    status: goal.status
                }));
                await trx
                    .insertInto('savings_goals')
                    .values(goalsData)
                    .onConflict((oc) => oc.column('goal_id').doUpdateSet((eb) => ({
                    target_amount: eb.ref('excluded.target_amount'),
                    target_date: eb.ref('excluded.target_date'),
                    current_saved: eb.ref('excluded.current_saved'),
                    status: eb.ref('excluded.status'),
                    updated_at: new Date()
                })))
                    .execute();
            }
        });
    }
    /**
     * Get complete banking data for a user
     */
    async getBankingData(userId) {
        try {
            // Get user profile
            const user = await db
                .selectFrom('users')
                .where('user_id', '=', userId)
                .selectAll()
                .executeTakeFirst();
            if (!user) {
                return null;
            }
            console.log('User employment data:', user.employment);
            // Parse employment JSON
            let employment;
            try {
                employment = JSON.parse(user.employment);
            }
            catch (parseError) {
                console.error('Error parsing employment JSON:', parseError);
                employment = {};
            }
            const userProfile = {
                ...user,
                employment,
                created_at: user.created_at?.toISOString(),
                updated_at: user.updated_at?.toISOString()
            };
            // Get accounts
            const accounts = await db
                .selectFrom('accounts')
                .where('user_id', '=', userId)
                .selectAll()
                .execute();
            // Convert dates to ISO strings
            const accountsWithDates = accounts.map(account => ({
                ...account,
                created_at: account.created_at?.toISOString(),
                updated_at: account.updated_at?.toISOString()
            }));
            // Get loans
            const loans = await db
                .selectFrom('loans')
                .where('user_id', '=', userId)
                .selectAll()
                .execute();
            const loansWithDates = loans.map(loan => ({
                ...loan,
                created_at: loan.created_at?.toISOString(),
                updated_at: loan.updated_at?.toISOString()
            }));
            // Get subscriptions
            const subscriptions = await db
                .selectFrom('subscriptions')
                .where('user_id', '=', userId)
                .selectAll()
                .execute();
            const subscriptionsWithDates = subscriptions.map(sub => ({
                ...sub,
                created_at: sub.created_at?.toISOString(),
                updated_at: sub.updated_at?.toISOString()
            }));
            // Get investments
            const investments = await db
                .selectFrom('investments')
                .where('user_id', '=', userId)
                .selectAll()
                .execute();
            const investmentsWithDates = investments.map(inv => ({
                ...inv,
                created_at: inv.created_at?.toISOString(),
                updated_at: inv.updated_at?.toISOString()
            }));
            // Get transactions (limit to recent 1000 for performance)
            const transactions = await db
                .selectFrom('transactions')
                .where('user_id', '=', userId)
                .orderBy('date', 'desc')
                .limit(1000)
                .selectAll()
                .execute();
            const transactionsWithDates = transactions.map(tx => ({
                ...tx,
                created_at: tx.created_at?.toISOString()
            }));
            // Get savings goals
            const savingsGoals = await db
                .selectFrom('savings_goals')
                .where('user_id', '=', userId)
                .selectAll()
                .execute();
            const savingsGoalsWithDates = savingsGoals.map(goal => ({
                ...goal,
                created_at: goal.created_at?.toISOString(),
                updated_at: goal.updated_at?.toISOString()
            }));
            return {
                userProfile,
                accounts: accountsWithDates,
                loans: loansWithDates,
                subscriptions: subscriptionsWithDates,
                investments: investmentsWithDates,
                transactions: transactionsWithDates,
                savingsGoals: savingsGoalsWithDates
            };
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Get user profile only
     */
    async getUserProfile(userId) {
        try {
            const user = await db
                .selectFrom('users')
                .where('user_id', '=', userId)
                .selectAll()
                .executeTakeFirst();
            if (!user)
                return null;
            let employment;
            try {
                employment = JSON.parse(user.employment);
            }
            catch (parseError) {
                console.error('Error parsing employment JSON in getUserProfile:', parseError);
                employment = {};
            }
            return {
                ...user,
                employment,
                created_at: user.created_at?.toISOString(),
                updated_at: user.updated_at?.toISOString()
            };
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Get accounts for a user
     */
    async getAccounts(userId) {
        try {
            const accounts = await db
                .selectFrom('accounts')
                .where('user_id', '=', userId)
                .selectAll()
                .execute();
            return accounts.map(account => ({
                ...account,
                created_at: account.created_at?.toISOString(),
                updated_at: account.updated_at?.toISOString()
            }));
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Get transactions for a user with optional filtering
     */
    async getTransactions(userId, limit = 100, offset = 0, startDate, endDate, category) {
        try {
            let query = db
                .selectFrom('transactions')
                .where('user_id', '=', userId);
            if (startDate) {
                query = query.where('date', '>=', startDate);
            }
            if (endDate) {
                query = query.where('date', '<=', endDate);
            }
            if (category) {
                query = query.where('category', '=', category);
            }
            const transactions = await query
                .orderBy('date', 'desc')
                .limit(limit)
                .offset(offset)
                .selectAll()
                .execute();
            return transactions.map(tx => ({
                ...tx,
                created_at: tx.created_at?.toISOString()
            }));
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Update user profile
     */
    async updateUserProfile(userId, updates) {
        try {
            const updateData = { ...updates };
            if (updates.employment) {
                updateData.employment = JSON.stringify(updates.employment);
            }
            updateData.updated_at = new Date();
            await db
                .updateTable('users')
                .set(updateData)
                .where('user_id', '=', userId)
                .execute();
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Delete all banking data for a user
     */
    async deleteUserData(userId) {
        await db.transaction().execute(async (trx) => {
            await trx
                .deleteFrom('savings_goals')
                .where('user_id', '=', userId)
                .execute();
            await trx
                .deleteFrom('transactions')
                .where('user_id', '=', userId)
                .execute();
            await trx
                .deleteFrom('investments')
                .where('user_id', '=', userId)
                .execute();
            await trx
                .deleteFrom('subscriptions')
                .where('user_id', '=', userId)
                .execute();
            await trx
                .deleteFrom('loans')
                .where('user_id', '=', userId)
                .execute();
            await trx
                .deleteFrom('accounts')
                .where('user_id', '=', userId)
                .execute();
            await trx
                .deleteFrom('users')
                .where('user_id', '=', userId)
                .execute();
        });
    }
}
