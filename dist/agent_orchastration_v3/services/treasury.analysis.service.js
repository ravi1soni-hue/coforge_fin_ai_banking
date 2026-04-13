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
        const latestMonthly = await this.structuredRepo.getLatestMonthlySummary(userId);
        const latestSnapshot = await this.structuredRepo.getLatestTreasuryDecisionSnapshot(userId);
        const supplierCandidates = await this.structuredRepo.getTreasurySupplierCandidates(userId);
        const recentCashflow = await this.structuredRepo.getRecentTreasuryCashflow(userId, 90);
        const currency = String(knownFacts.currency ??
            knownFacts.profileCurrency ??
            latestSnapshot?.currency ??
            latestMonthly?.currency ??
            balances[0]?.currency ??
            "GBP").toUpperCase();
        const availableLiquidity = balances.reduce((sum, b) => sum + Number(b.balance ?? 0), 0);
        const monthlyExpenses = parseNum(knownFacts.monthlyExpenses) ?? latestMonthly?.totalExpenses ?? 0;
        const weeklyOutflow = parseNum(knownFacts.weeklyOutflowAvg) ??
            parseNum(knownFacts.weeklyOutflow) ??
            latestSnapshot?.weeklyOutflowBaseline ??
            (monthlyExpenses > 0 ? monthlyExpenses / 4 : 0);
        const expectedMidweekInflow = parseNum(knownFacts.expectedMidweekInflow) ??
            parseNum(knownFacts.inflowTueThuAvg) ??
            latestSnapshot?.midweekInflowBaseline ??
            0;
        const lateInflowEventsLast4Weeks = Math.max(0, Math.round(parseNum(knownFacts.lateInflowsLast4Weeks) ?? parseNum(knownFacts.lateReceiptCount4Weeks) ?? 0));
        const observedLateInflows = recentCashflow
            .slice(0, 28)
            .filter((r) => {
            const m = (r.metadata ?? {});
            return String(m.receiptPunctuality ?? "").toUpperCase() === "LATE";
        }).length;
        const effectiveLateInflowCount = Math.max(lateInflowEventsLast4Weeks, latestSnapshot?.lateInflowCountLast4Weeks ?? 0, observedLateInflows);
        const comfortThreshold = parseNum(knownFacts.internalComfortThreshold) ??
            parseNum(knownFacts.minLiquidityThreshold) ??
            latestSnapshot?.comfortThreshold ??
            Math.max(0, weeklyOutflow * 0.35);
        const paymentAmount = parseNum(knownFacts.paymentAmount) ??
            parseMoneyWithSuffix(message);
        const urgentSupplierTotal = sum(supplierCandidates
            .filter((c) => c.urgency === "URGENT")
            .map((c) => Number(c.amount ?? 0)));
        const deferableSupplierTotal = sum(supplierCandidates
            .filter((c) => c.urgency === "DEFERABLE")
            .map((c) => Number(c.amount ?? 0)));
        const amountToAnalyse = paymentAmount > 0
            ? paymentAmount
            : (urgentSupplierTotal + deferableSupplierTotal);
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
            const baseNow = urgentSupplierTotal > 0 ? Math.round(urgentSupplierTotal) : Math.floor(amountToAnalyse * 0.7);
            const maxNowFromBuffer = Math.max(0, Math.floor(availableLiquidity - weeklyOutflow + expectedMidweekInflow - adjustedThreshold));
            suggestedNowAmount = Math.max(0, Math.min(baseNow, maxNowFromBuffer > 0 ? maxNowFromBuffer : baseNow));
            suggestedLaterAmount = Math.max(0, amountToAnalyse - suggestedNowAmount);
        }
        else {
            suggestedNowAmount = Math.round(amountToAnalyse);
            suggestedLaterAmount = 0;
        }
        const minInflowForMidweekRelease = parseNum(knownFacts.minInflowForMidweekRelease) ??
            latestSnapshot?.minInflowForMidweekRelease ??
            Math.max(0, Math.round((suggestedLaterAmount || amountToAnalyse * 0.3) * 2.6));
        const releaseConditionHitRate10Weeks = parseNum(knownFacts.releaseConditionHitRate10Weeks) ??
            latestSnapshot?.releaseConditionHitRate10Weeks ??
            0;
        const projectedLowBalanceIfFullRelease = availableLiquidity - amountToAnalyse - weeklyOutflow + expectedMidweekInflow;
        const projectedLowBalanceIfSplit = availableLiquidity - suggestedNowAmount - weeklyOutflow + expectedMidweekInflow;
        const rationale = [
            `Liquidity ${availableLiquidity.toLocaleString("en-GB")} ${currency}`,
            weeklyOutflow > 0 ? `weekly outflow ${Math.round(weeklyOutflow).toLocaleString("en-GB")}` : "weekly outflow unavailable",
            expectedMidweekInflow > 0 ? `midweek inflow ${Math.round(expectedMidweekInflow).toLocaleString("en-GB")}` : "midweek inflow unavailable",
            `urgent/deferable ${Math.round(urgentSupplierTotal).toLocaleString("en-GB")}/${Math.round(deferableSupplierTotal).toLocaleString("en-GB")}`,
            `threshold ${Math.round(adjustedThreshold).toLocaleString("en-GB")}`,
            `projected low ${Math.round(projectedLowBalance).toLocaleString("en-GB")}`,
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
            releaseConditionHitRate10Weeks: Number(releaseConditionHitRate10Weeks.toFixed(2)),
            currency,
            rationale,
        };
    }
}
