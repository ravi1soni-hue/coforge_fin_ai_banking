const parseNum = (v) => {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(n))
            return n;
    }
    return undefined;
};
const parseMoneyWithSuffix = (text) => {
    const lower = text.toLowerCase().replace(/,/g, "");
    const m = lower.match(/(?:£|gbp\s*)?(\d+(?:\.\d+)?)\s*([km])\b/i);
    if (m) {
        const base = Number(m[1]);
        const mult = m[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
        return Math.round(base * mult);
    }
    const n = lower.match(/(?:£|gbp\s*)?(\d{3,9}(?:\.\d+)?)/i);
    if (!n)
        return 0;
    const value = Number(n[1]);
    return Number.isFinite(value) ? Math.round(value) : 0;
};
const isTreasuryQuestion = (message) => {
    return /(supplier|payment\s*run|release|liquidity|cash\s*buffer|payroll|inflow|outflow|split|batch|auto[-\s]?release)/i.test(message);
};
const sum = (values) => values.reduce((a, b) => a + b, 0);
export class TreasuryAnalysisService {
    structuredRepo;
    constructor(structuredRepo) {
        this.structuredRepo = structuredRepo;
    }
    async analyze(userId, message, knownFacts = {}) {
        if (!isTreasuryQuestion(message))
            return null;
        const balances = await this.structuredRepo.getBalances(userId);
        const latestSnapshot = await this.structuredRepo.getLatestTreasuryDecisionSnapshot(userId);
        const supplierCandidates = await this.structuredRepo.getTreasurySupplierCandidates(userId);
        const recentCashflow = await this.structuredRepo.getRecentTreasuryCashflow(userId, 90);
        const currency = String(knownFacts.currency ??
            knownFacts.profileCurrency ??
            latestSnapshot?.currency ??
            balances[0]?.currency ??
            "GBP").toUpperCase();
        const availableLiquidity = balances.reduce((sum, b) => sum + Number(b.balance ?? 0), 0);
        // Payroll modeling: find typical payroll outflow and its weekday
        let payrollOutflow = 0;
        let payrollDay = "";
        if (recentCashflow.length > 0) {
            // Find the most common payroll outflow and its day
            const payrolls = recentCashflow.filter(r => r.payroll_outflow && r.payroll_outflow > 0 && typeof r.day_name === "string" && r.day_name);
            if (payrolls.length > 0) {
                // Use median payroll outflow
                const sortedPayrolls = payrolls.map(r => r.payroll_outflow).sort((a, b) => a - b);
                payrollOutflow = sortedPayrolls[Math.floor(sortedPayrolls.length / 2)];
                // Find most common payroll weekday
                const dayCounts = payrolls.reduce((acc, r) => {
                    if (typeof r.day_name === "string" && r.day_name) {
                        acc[r.day_name] = (acc[r.day_name] || 0) + 1;
                    }
                    return acc;
                }, {});
                payrollDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
            }
        }
        // Historical buffer: lowest closing balance before payroll for each week
        let historicalBuffer = 0;
        if (payrollDay && recentCashflow.length > 7) {
            // Group by week, find lowest closing balance before payroll
            const weeks = [];
            let currentWeek = [];
            for (let i = 0; i < recentCashflow.length; i++) {
                const r = recentCashflow[i];
                if (r.day_name === payrollDay && currentWeek.length > 0) {
                    weeks.push(currentWeek);
                    currentWeek = [];
                }
                if (typeof r.closing_balance === "number")
                    currentWeek.push(r.closing_balance);
            }
            if (currentWeek.length > 0)
                weeks.push(currentWeek);
            // Find lowest balance in each week
            const lows = weeks.map(w => Math.min(...w));
            if (lows.length > 0) {
                // Use median of weekly lows as historical buffer
                const sortedLows = lows.sort((a, b) => a - b);
                historicalBuffer = sortedLows[Math.floor(sortedLows.length / 2)];
            }
        }
        const monthlyExpenses = parseNum(knownFacts.monthlyExpenses) ?? 0;
        const weeklyOutflow = parseNum(knownFacts.weeklyOutflowAvg) ??
            parseNum(knownFacts.weeklyOutflow) ??
            latestSnapshot?.weekly_outflow_baseline ??
            (monthlyExpenses > 0 ? monthlyExpenses / 4 : 0);
        const expectedMidweekInflow = parseNum(knownFacts.expectedMidweekInflow) ??
            parseNum(knownFacts.inflowTueThuAvg) ??
            latestSnapshot?.midweek_inflow_baseline ??
            0;
        // Inflow reliability: how often inflows are late in last 4/8 weeks
        const lateInflowEventsLast4Weeks = Math.max(0, Math.round(parseNum(knownFacts.lateInflowsLast4Weeks) ?? parseNum(knownFacts.lateReceiptCount4Weeks) ?? 0));
        const observedLateInflows = recentCashflow
            .slice(0, 28)
            .filter((r) => {
            const m = (r.metadata ?? {});
            return String(m.receiptPunctuality ?? "").toUpperCase() === "LATE";
        }).length;
        const effectiveLateInflowCount = Math.max(lateInflowEventsLast4Weeks, latestSnapshot?.late_inflow_count_last_4_weeks ?? 0, observedLateInflows);
        const comfortThreshold = parseNum(knownFacts.internalComfortThreshold) ??
            parseNum(knownFacts.minLiquidityThreshold) ??
            latestSnapshot?.comfort_threshold ??
            Math.max(0, weeklyOutflow * 0.35);
        const urgentSupplierTotal = sum(supplierCandidates
            .filter((c) => c.urgency === "URGENT")
            .map((c) => Number(c.amount ?? 0)));
        const deferableSupplierTotal = sum(supplierCandidates
            .filter((c) => c.urgency === "DEFERABLE")
            .map((c) => Number(c.amount ?? 0)));
        // Strictly anchor to user-requested amount if present
        let paymentAmount = 0;
        const parsedKnownFactAmount = knownFacts.paymentAmount !== undefined ? parseNum(knownFacts.paymentAmount) : undefined;
        if (parsedKnownFactAmount !== undefined && parsedKnownFactAmount > 0) {
            paymentAmount = parsedKnownFactAmount;
        }
        else {
            // Try to extract from user message
            paymentAmount = parseMoneyWithSuffix(message);
        }
        // Only if user did NOT specify an amount, fallback to DB totals
        const usedDbTotal = paymentAmount <= 0;
        if (usedDbTotal) {
            paymentAmount = urgentSupplierTotal + deferableSupplierTotal;
        }
        // --- SANITY CHECKS & LOGGING ---
        if (typeof paymentAmount !== 'number' || isNaN(paymentAmount)) {
            console.error('[TREASURY] Invalid paymentAmount (not a number):', paymentAmount);
            paymentAmount = 0;
        }
        else if (paymentAmount < 0) {
            console.error('[TREASURY] Negative paymentAmount:', paymentAmount);
            paymentAmount = 0;
        }
        else if (paymentAmount > availableLiquidity * 10) {
            console.error('[TREASURY] Unrealistically large paymentAmount:', paymentAmount, 'Liquidity:', availableLiquidity);
            paymentAmount = availableLiquidity; // Cap to available liquidity as a failsafe
        }
        // Always analyze the user-requested amount unless ambiguous
        const amountToAnalyse = paymentAmount;
        const projectedLowBalance = availableLiquidity - amountToAnalyse - weeklyOutflow + expectedMidweekInflow;
        const latePenalty = effectiveLateInflowCount >= 2 ? comfortThreshold * 0.1 : 0;
        const adjustedThreshold = comfortThreshold + latePenalty;
        const riskLevel = projectedLowBalance >= adjustedThreshold
            ? "SAFE"
            : projectedLowBalance >= adjustedThreshold * 0.85
                ? "CAUTION"
                : "HIGH_RISK";
        let suggestedNowAmount = paymentAmount;
        let suggestedLaterAmount = 0;
        if (amountToAnalyse > 0 && riskLevel !== "SAFE") {
            // Always split the user-requested amount, not DB total
            const baseNow = Math.floor(amountToAnalyse * 0.7);
            const maxNowFromBuffer = Math.max(0, Math.floor(availableLiquidity - weeklyOutflow + expectedMidweekInflow - adjustedThreshold));
            suggestedNowAmount = Math.max(0, Math.min(baseNow, maxNowFromBuffer > 0 ? maxNowFromBuffer : baseNow));
            suggestedLaterAmount = Math.max(0, amountToAnalyse - suggestedNowAmount);
        }
        else {
            suggestedNowAmount = Math.round(amountToAnalyse);
            suggestedLaterAmount = 0;
        }
        const minInflowForMidweekRelease = parseNum(knownFacts.minInflowForMidweekRelease) ??
            latestSnapshot?.min_inflow_for_midweek_release ??
            Math.max(0, Math.round((suggestedLaterAmount || amountToAnalyse * 0.3) * 2.6));
        const releaseConditionHitRate10Weeks = parseNum(knownFacts.releaseConditionHitRate10Weeks) ??
            latestSnapshot?.release_condition_hit_rate_10_weeks ??
            0;
        const projectedLowBalanceIfFullRelease = availableLiquidity - amountToAnalyse - weeklyOutflow + expectedMidweekInflow;
        const projectedLowBalanceIfSplit = availableLiquidity - suggestedNowAmount - weeklyOutflow + expectedMidweekInflow;
        // Scenario/simulation logic: simulate projected balances if inflows are late/early
        const inflowVariance = Math.round(expectedMidweekInflow * 0.3); // 30% variance for simulation
        const inflowLate = Math.max(0, expectedMidweekInflow - inflowVariance);
        const inflowEarly = expectedMidweekInflow + inflowVariance;
        const projectedLowIfLateInflow = availableLiquidity - amountToAnalyse - weeklyOutflow + inflowLate;
        const projectedLowIfEarlyInflow = availableLiquidity - amountToAnalyse - weeklyOutflow + inflowEarly;
        // Enhanced rationale for scenario-aware, script-aligned output
        const rationale = [
            `Liquidity ${availableLiquidity.toLocaleString("en-GB")} ${currency}`,
            weeklyOutflow > 0 ? `weekly outflow ${Math.round(weeklyOutflow).toLocaleString("en-GB")}` : "weekly outflow unavailable",
            expectedMidweekInflow > 0 ? `midweek inflow ${Math.round(expectedMidweekInflow).toLocaleString("en-GB")}` : "midweek inflow unavailable",
            payrollOutflow > 0 ? `payroll outflow ${Math.round(payrollOutflow).toLocaleString("en-GB")}${payrollDay ? " on " + payrollDay : ""}` : "payroll unavailable",
            historicalBuffer > 0 ? `historical buffer (pre-payroll low) ${Math.round(historicalBuffer).toLocaleString("en-GB")}` : "historical buffer unavailable",
            `urgent/deferable ${Math.round(urgentSupplierTotal).toLocaleString("en-GB")}/${Math.round(deferableSupplierTotal).toLocaleString("en-GB")}`,
            `threshold ${Math.round(adjustedThreshold).toLocaleString("en-GB")}`,
            `projected low ${Math.round(projectedLowBalance).toLocaleString("en-GB")}`,
            `projected low if inflow late ${Math.round(projectedLowIfLateInflow).toLocaleString("en-GB")}`,
            `projected low if inflow early ${Math.round(projectedLowIfEarlyInflow).toLocaleString("en-GB")}`,
            `late inflow events (4w) ${lateInflowEventsLast4Weeks}, observed late inflows (28d) ${observedLateInflows}`,
            usedDbTotal ? "(No amount specified by user, using total supplier run)" : "(User-requested amount strictly used)"
        ].join("; ");
        return {
            availableLiquidity: Math.round(availableLiquidity),
            weeklyOutflow: Math.round(weeklyOutflow),
            expectedMidweekInflow: Math.round(expectedMidweekInflow),
            lateInflowEventsLast4Weeks: effectiveLateInflowCount,
            comfortThreshold: Math.round(adjustedThreshold),
            paymentAmount: Math.round(amountToAnalyse),
            urgentSupplierTotal: Math.round(urgentSupplierTotal),
            deferableSupplierTotal: Math.round(deferableSupplierTotal),
            projectedLowBalance: Math.round(projectedLowBalance),
            projectedLowBalanceIfFullRelease: Math.round(projectedLowBalanceIfFullRelease),
            projectedLowBalanceIfSplit: Math.round(projectedLowBalanceIfSplit),
            riskLevel,
            suggestedNowAmount: Math.round(suggestedNowAmount),
            suggestedLaterAmount: Math.round(suggestedLaterAmount),
            minInflowForMidweekRelease: Math.round(minInflowForMidweekRelease),
            releaseConditionHitRate10Weeks: typeof releaseConditionHitRate10Weeks === 'number' && isFinite(releaseConditionHitRate10Weeks)
                ? Number(releaseConditionHitRate10Weeks.toFixed(2))
                : 0,
            currency,
            rationale,
            usedUserAmount: !usedDbTotal, // true if user amount was used, false if fallback to DB total
            // Expose new scenario-aware fields for downstream use
            payrollOutflow: Math.round(payrollOutflow),
            payrollDay,
            historicalBuffer: Math.round(historicalBuffer),
            observedLateInflows,
            // Simulation/scenario fields
            projectedLowIfLateInflow: Math.round(projectedLowIfLateInflow),
            projectedLowIfEarlyInflow: Math.round(projectedLowIfEarlyInflow),
            inflowVariance: Math.round(inflowVariance),
        };
    }
}
