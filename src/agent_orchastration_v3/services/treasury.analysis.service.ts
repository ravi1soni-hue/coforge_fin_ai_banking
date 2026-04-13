import type { StructuredFinancialRepository } from "../../repo/structured.finance.repo.js";
import type { TreasuryAnalysis } from "../graph/state.js";

const parseNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const parseMoneyWithSuffix = (text: string): number => {
  const lower = text.toLowerCase().replace(/,/g, "");
  const m = lower.match(/(?:£|gbp\s*)?(\d+(?:\.\d+)?)\s*([km])\b/i);
  if (m) {
    const base = Number(m[1]);
    const mult = m[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    return Math.round(base * mult);
  }
  const n = lower.match(/(?:£|gbp\s*)?(\d{3,9}(?:\.\d+)?)/i);
  if (!n) return 0;
  const value = Number(n[1]);
  return Number.isFinite(value) ? Math.round(value) : 0;
};

const isTreasuryQuestion = (message: string): boolean => {
  return /(supplier|payment\s*run|release|liquidity|cash\s*buffer|payroll|inflow|outflow|split|batch|auto[-\s]?release)/i.test(message);
};

export class TreasuryAnalysisService {
  constructor(private readonly structuredRepo: StructuredFinancialRepository) {}

  async analyze(
    userId: string,
    message: string,
    knownFacts: Record<string, unknown> = {},
  ): Promise<TreasuryAnalysis | null> {
    if (!isTreasuryQuestion(message)) return null;

    const balances = await this.structuredRepo.getBalances(userId);
    const latestMonthly = await this.structuredRepo.getLatestMonthlySummary(userId);

    const currency = String(
      knownFacts.currency ??
      knownFacts.profileCurrency ??
      latestMonthly?.currency ??
      balances[0]?.currency ??
      "GBP",
    ).toUpperCase();

    const availableLiquidity = balances.reduce((sum, b) => sum + Number(b.balance ?? 0), 0);

    const monthlyExpenses = parseNum(knownFacts.monthlyExpenses) ?? latestMonthly?.totalExpenses ?? 0;
    const weeklyOutflow =
      parseNum(knownFacts.weeklyOutflowAvg) ??
      parseNum(knownFacts.weeklyOutflow) ??
      (monthlyExpenses > 0 ? monthlyExpenses / 4 : 0);

    const expectedMidweekInflow =
      parseNum(knownFacts.expectedMidweekInflow) ??
      parseNum(knownFacts.inflowTueThuAvg) ??
      0;

    const lateInflowEventsLast4Weeks =
      Math.max(0, Math.round(parseNum(knownFacts.lateInflowsLast4Weeks) ?? parseNum(knownFacts.lateReceiptCount4Weeks) ?? 0));

    const comfortThreshold =
      parseNum(knownFacts.internalComfortThreshold) ??
      parseNum(knownFacts.minLiquidityThreshold) ??
      Math.max(0, weeklyOutflow * 0.35);

    const paymentAmount =
      parseNum(knownFacts.paymentAmount) ??
      parseMoneyWithSuffix(message);

    const projectedLowBalance =
      availableLiquidity - paymentAmount - weeklyOutflow + expectedMidweekInflow;

    const latePenalty = lateInflowEventsLast4Weeks >= 2 ? comfortThreshold * 0.1 : 0;
    const adjustedThreshold = comfortThreshold + latePenalty;

    const riskLevel: TreasuryAnalysis["riskLevel"] =
      projectedLowBalance >= adjustedThreshold
        ? "SAFE"
        : projectedLowBalance >= adjustedThreshold * 0.85
          ? "CAUTION"
          : "HIGH_RISK";

    let suggestedNowAmount = paymentAmount;
    let suggestedLaterAmount = 0;

    if (paymentAmount > 0 && riskLevel !== "SAFE") {
      const baseNow = Math.floor(paymentAmount * 0.7);
      const maxNowFromBuffer = Math.max(0, Math.floor(availableLiquidity - weeklyOutflow + expectedMidweekInflow - adjustedThreshold));
      suggestedNowAmount = Math.max(0, Math.min(baseNow, maxNowFromBuffer > 0 ? maxNowFromBuffer : baseNow));
      suggestedLaterAmount = Math.max(0, paymentAmount - suggestedNowAmount);
    }

    const rationale = [
      `Liquidity ${availableLiquidity.toLocaleString("en-GB")} ${currency}`,
      weeklyOutflow > 0 ? `weekly outflow ${Math.round(weeklyOutflow).toLocaleString("en-GB")}` : "weekly outflow unavailable",
      expectedMidweekInflow > 0 ? `midweek inflow ${Math.round(expectedMidweekInflow).toLocaleString("en-GB")}` : "midweek inflow unavailable",
      `threshold ${Math.round(adjustedThreshold).toLocaleString("en-GB")}`,
      `projected low ${Math.round(projectedLowBalance).toLocaleString("en-GB")}`,
    ].join("; ");

    return {
      availableLiquidity: Math.round(availableLiquidity),
      weeklyOutflow: Math.round(weeklyOutflow),
      expectedMidweekInflow: Math.round(expectedMidweekInflow),
      lateInflowEventsLast4Weeks,
      comfortThreshold: Math.round(adjustedThreshold),
      paymentAmount: Math.round(paymentAmount),
      projectedLowBalance: Math.round(projectedLowBalance),
      riskLevel,
      suggestedNowAmount: Math.round(suggestedNowAmount),
      suggestedLaterAmount: Math.round(suggestedLaterAmount),
      currency,
      rationale,
    };
  }
}