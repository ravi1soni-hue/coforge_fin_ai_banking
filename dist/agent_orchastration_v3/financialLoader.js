// DEBUG LOGGING: Add detailed logs for tracing pipeline
import fs from 'fs';
const DEBUG_LOG_PATH = process.env.FINAI_DEBUG_LOG_PATH || '/tmp/finai_debug.log';
function debugLog(label, data) {
    try {
        const logEntry = `[${new Date().toISOString()}] ${label}: ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}\n`;
        fs.appendFileSync(DEBUG_LOG_PATH, logEntry);
    }
    catch (e) {
        // ignore logging errors
    }
}
/**
 * Loads the user's financial profile from already-normalised knownFacts
 * (populated by client profile seed) or falls back to the structured DB,
 * and finally to vector DB as last resort.
 */
import { sql } from "kysely";
/** Parse a raw unknown value to a finite number (or undefined) */
const parseNum = (v) => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0)
        return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(n) && n > 0)
            return n;
    }
    return undefined;
};
export class FinancialLoader {
    vectorQuery;
    llm;
    db;
    constructor(vectorQuery, llm, db) {
        this.vectorQuery = vectorQuery;
        this.llm = llm;
        this.db = db;
    }
    /**
     * Extended debug: Optionally pass userQuery and llmIntent for full trace
     */
    async loadProfile(userId, knownFacts, userQuery, llmIntent) {
        debugLog('--- LOAD PROFILE START ---', { userQuery, llmIntent, knownFacts });
        const profileLookupUserId = typeof knownFacts.profileLookupUserId === "string" && knownFacts.profileLookupUserId.trim()
            ? knownFacts.profileLookupUserId.trim()
            : userId;
        debugLog('profileLookupUserId', profileLookupUserId);
        // Primary: use already-normalised facts from the profile seed
        // If intent is corporate/treasury, only sum current/operating/reserve accounts for liquidity
        let savings = undefined;
        let liquidity = undefined;
        const intentType = typeof knownFacts.intentType === "string" ? knownFacts.intentType : undefined;
        if (Array.isArray(knownFacts.accounts)) {
            debugLog('accounts', knownFacts.accounts);
            if (intentType === "corporate_treasury") {
                // Only sum current/operating/reserve accounts
                liquidity = knownFacts.accounts
                    .filter((a) => typeof a.type === "string" && ["current", "operating", "reserve"].includes(a.type.toLowerCase()))
                    .reduce((sum, a) => sum + (parseNum(a.balance) ?? 0), 0);
                debugLog('liquidity (corporate/treasury)', liquidity);
            }
            else {
                // Only sum savings/investment accounts
                savings = knownFacts.accounts
                    .filter((a) => typeof a.type === "string" && ["savings", "isa", "deposit", "investment"].includes(a.type.toLowerCase()))
                    .reduce((sum, a) => sum + (parseNum(a.balance) ?? 0), 0);
                debugLog('savings (retail)', savings);
            }
        }
        // Fallbacks for legacy/seeded facts
        // Only use legacy fields if accounts array is missing or not an array
        if (!Array.isArray(knownFacts.accounts)) {
            debugLog('accounts missing, using legacy fields', knownFacts);
            if (savings === undefined)
                savings = parseNum(knownFacts.availableSavings) ?? parseNum(knownFacts.spendable_savings);
            if (liquidity === undefined)
                liquidity = parseNum(knownFacts.currentBalance);
            debugLog('legacy savings', savings);
            debugLog('legacy liquidity', liquidity);
        }
        const income = parseNum(knownFacts.monthlyIncome);
        const expenses = parseNum(knownFacts.monthlyExpenses);
        const surplus = parseNum(knownFacts.netMonthlySavings) ??
            (income !== undefined && expenses !== undefined ? income - expenses : undefined);
        debugLog('income', income);
        debugLog('expenses', expenses);
        debugLog('surplus', surplus);
        const currency = String(knownFacts.profileCurrency ?? knownFacts.currency ?? "GBP");
        debugLog('currency', currency);
        const userName = typeof knownFacts.userName === "string" ? knownFacts.userName : undefined;
        debugLog('userName', userName);
        if (intentType === "corporate_treasury" && liquidity !== undefined && liquidity >= 0) {
            const profile = {
                availableSavings: liquidity, // For treasury, this is actually liquidity
                monthlyIncome: income,
                monthlyExpenses: expenses,
                netMonthlySurplus: surplus,
                homeCurrency: currency,
                userName,
            };
            debugLog('RETURN profile (corporate/treasury)', profile);
            debugLog('--- LOAD PROFILE END ---', {});
            return profile;
        }
        if ((intentType !== "corporate_treasury" || !intentType) && savings !== undefined && savings >= 0) {
            const profile = {
                availableSavings: savings,
                monthlyIncome: income,
                monthlyExpenses: expenses,
                netMonthlySurplus: surplus,
                homeCurrency: currency,
                userName,
            };
            debugLog('RETURN profile (retail)', profile);
            debugLog('--- LOAD PROFILE END ---', {});
            return profile;
        }
        // Secondary: query account_balances + financial_summary_monthly (seeded, deterministic)
        if (this.db) {
            try {
                const row = await sql `
          SELECT COALESCE(SUM(balance), 0)::text AS total_balance,
                 MAX(currency) AS currency
          FROM account_balances
             WHERE user_id = ${profileLookupUserId}
        `.execute(this.db);
                debugLog('account_balances row', row.rows);
                const monthlyRow = await sql `
          SELECT total_income AS monthly_income,
                 total_expenses AS monthly_expenses,
                 net_cashflow
          FROM financial_summary_monthly
             WHERE user_id = ${profileLookupUserId}
          ORDER BY month DESC
          LIMIT 1
        `.execute(this.db);
                debugLog('financial_summary_monthly row', monthlyRow.rows);
                const p = row.rows[0];
                const m = monthlyRow.rows[0];
                if (p && p.total_balance !== null && Number(p.total_balance) > 0) {
                    const dbSavings = Number(p.total_balance);
                    const dbIncome = m?.monthly_income != null ? Number(m.monthly_income) : undefined;
                    const dbExpenses = m?.monthly_expenses != null ? Number(m.monthly_expenses) : undefined;
                    const dbSurplus = m?.net_cashflow != null
                        ? Number(m.net_cashflow)
                        : dbIncome !== undefined && dbExpenses !== undefined
                            ? dbIncome - dbExpenses
                            : undefined;
                    debugLog('Loaded from account_balances+monthly', { dbSavings, dbIncome, dbExpenses, dbSurplus, currency: p.currency ?? currency });
                    const profile = {
                        availableSavings: dbSavings,
                        monthlyIncome: dbIncome,
                        monthlyExpenses: dbExpenses,
                        netMonthlySurplus: dbSurplus,
                        homeCurrency: p.currency ?? currency,
                        userName,
                    };
                    debugLog('RETURN profile (db)', profile);
                    debugLog('--- LOAD PROFILE END ---', {});
                    return profile;
                }
            }
            catch (err) {
                debugLog('DB profile lookup failed, falling back to vector DB', String(err));
            }
        }
        // Tertiary: query vector DB and let LLM extract profile
        debugLog('knownFacts and DB empty — falling back to vector DB', {});
        const context = await this.vectorQuery.getContext(profileLookupUserId, "savings balance monthly income expenses currency", { topK: 6 });
        if (!context) {
            return { availableSavings: 0, homeCurrency: currency };
        }
        const extracted = await this.llm.generateJSON(`Extract the user's financial summary from the context below.

Context:
${context}

Return ONLY valid JSON (no markdown):
{
  "availableSavings": number | null,
  "monthlyIncome": number | null,
  "monthlyExpenses": number | null,
  "currency": "GBP" | null
}

Note: This service is UK-only. currency is always "GBP" — only return null if completely absent from context.`);
        const profile = {
            availableSavings: parseNum(extracted.availableSavings) ?? 0,
            monthlyIncome: parseNum(extracted.monthlyIncome),
            monthlyExpenses: parseNum(extracted.monthlyExpenses),
            netMonthlySurplus: extracted.monthlyIncome && extracted.monthlyExpenses
                ? extracted.monthlyIncome - extracted.monthlyExpenses
                : undefined,
            homeCurrency: extracted.currency ?? currency,
        };
        debugLog('RETURN profile (vector DB)', profile);
        debugLog('--- LOAD PROFILE END ---', {});
        return profile;
    }
}
