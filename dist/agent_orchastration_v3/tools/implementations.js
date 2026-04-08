/**
 * V3 Tool Implementations — deterministic TypeScript functions.
 *
 * Every tool here is pure computation: no LLM calls, no side effects.
 * Results are returned as plain JSON objects that get injected back into
 * the LLM's context as tool messages.
 *
 * The LLM decides WHEN to call these; TypeScript decides WHAT they return.
 */
import { computeAffordabilityVerdict } from "../../agent_orchastration_v2/responseGenerators.js";
// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => Math.round(n).toLocaleString("en-GB");
/**
 * Parse a natural-language time horizon string to a number of months.
 * Returns undefined if the string cannot be parsed.
 */
function parseTimeHorizonToMonths(timeHorizon) {
    const s = timeHorizon.toLowerCase().trim();
    // "N month(s)"
    const monthMatch = s.match(/(\d+)\s*month/);
    if (monthMatch)
        return parseInt(monthMatch[1], 10);
    // "N year(s)"
    const yearMatch = s.match(/(\d+)\s*year/);
    if (yearMatch)
        return parseInt(yearMatch[1], 10) * 12;
    // "N week(s)"
    const weekMatch = s.match(/(\d+)\s*week/);
    if (weekMatch)
        return Math.ceil((parseInt(weekMatch[1], 10) * 7) / 30);
    // Common phrases
    if (/next year|in a year|1 year/.test(s))
        return 12;
    if (/half.?year|6.?month/.test(s))
        return 6;
    if (/quarter|3.?month/.test(s))
        return 3;
    return undefined;
}
/**
 * Returns the user's financial profile already loaded by the pipeline.
 * The profile is injected by the executor from the pre-loaded data.
 */
export function getFinancialProfile(args, profile) {
    return {
        userId: args.userId,
        availableSavings: profile.availableSavings,
        monthlyIncome: profile.monthlyIncome ?? null,
        monthlyExpenses: profile.monthlyExpenses ?? null,
        netMonthlySurplus: profile.netMonthlySurplus ?? null,
        homeCurrency: profile.homeCurrency,
        userName: profile.userName ?? null,
        note: `Profile loaded. Available savings: ${profile.homeCurrency} ${fmt(profile.availableSavings)}.`,
    };
}
/**
 * Computes affordability verdict using the same deterministic logic as V2.
 * Reuses computeAffordabilityVerdict from V2 responseGenerators to maintain
 * identical thresholds across both versions.
 */
export function checkAffordability(args, profile) {
    const { cost, currency } = args;
    const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
    const verdict = computeAffordabilityVerdict(profile, { goalType: "PURCHASE", cost, currency });
    const remaining = availableSavings - cost;
    const emergencyBuffer = netMonthlySurplus && netMonthlySurplus > 0
        ? netMonthlySurplus * 3
        : availableSavings * 0.2;
    const explanation = verdict === "COMFORTABLE"
        ? `After paying ${currency} ${fmt(cost)}, savings would be ${homeCurrency} ${fmt(remaining)}, well above the ${homeCurrency} ${fmt(emergencyBuffer)} emergency buffer.`
        : verdict === "RISKY"
            ? `After paying ${currency} ${fmt(cost)}, savings would be ${homeCurrency} ${fmt(remaining)}, below the ${homeCurrency} ${fmt(emergencyBuffer)} emergency buffer. Risky but technically possible.`
            : `Cost of ${currency} ${fmt(cost)} exceeds available savings of ${homeCurrency} ${fmt(availableSavings)} by ${homeCurrency} ${fmt(Math.abs(remaining))}.`;
    return {
        verdict,
        availableSavings,
        savingsCurrency: homeCurrency,
        cost,
        costCurrency: currency,
        remainingAfterPayment: remaining,
        shortfall: remaining < 0 ? Math.abs(remaining) : null,
        emergencyBuffer: Math.round(emergencyBuffer),
        shouldSuggestInstalments: verdict === "RISKY" || verdict === "CANNOT_AFFORD",
        explanation,
    };
}
/**
 * Generates EMI plan options using the same formulas as V2's generatePlanSimulation.
 * All values are pre-computed — the LLM only formats the narrative.
 */
export function generateEmiPlan(args, profile) {
    const { cost, currency } = args;
    const { availableSavings, homeCurrency } = profile;
    const upfrontRemaining = availableSavings - cost;
    const canAffordLumpSum = upfrontRemaining >= 0;
    const whyInstalments = canAffordLumpSum
        ? `Paying upfront would reduce savings to ${homeCurrency} ${fmt(upfrontRemaining)}, reducing the emergency cushion. Instalments keep savings intact.`
        : `A lump-sum payment is not viable — shortfall of ${homeCurrency} ${fmt(Math.abs(upfrontRemaining))}. Instalments spread the cost over time.`;
    const durations = args.months ? [args.months] : [3, 6, 12];
    const plans = durations.map((m) => ({
        months: m,
        monthlyPayment: Math.ceil(cost / m),
        totalCost: cost,
        savingsUntouched: availableSavings,
        savingsCurrency: homeCurrency,
        label: m === 3 ? "Short-term — finish quickly" :
            m === 6 ? "Balanced — moderate monthly commitment" :
                m === 12 ? "Long-term — lowest monthly pressure" :
                    `${m}-month plan`,
    }));
    return {
        cost,
        currency,
        requestedMonths: args.months ?? null,
        plans,
        savingsProtected: true,
        whyInstalments,
    };
}
/**
 * Determines feasibility of reaching a savings target.
 * All arithmetic is deterministic — zero LLM involvement.
 */
export function calculateSavingsProjection(args, profile) {
    const { targetAmount, currency, timeHorizon } = args;
    const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
    const canAlreadyAfford = availableSavings >= targetAmount;
    const timeHorizonMonths = timeHorizon
        ? parseTimeHorizonToMonths(timeHorizon) ?? null
        : null;
    const surplus = netMonthlySurplus ?? null;
    // If user can already afford it from savings
    if (canAlreadyAfford) {
        return {
            targetAmount,
            currency,
            currentSurplus: surplus,
            surplusCurrency: homeCurrency,
            currentSavings: availableSavings,
            savingsCurrency: homeCurrency,
            timeHorizonMonths,
            requiredMonthlySaving: null,
            monthsRequiredAtCurrentSurplus: 0,
            feasible: true,
            canAlreadyAfford: true,
            explanation: `You already have ${homeCurrency} ${fmt(availableSavings)} in savings, which covers the ${currency} ${fmt(targetAmount)} target.`,
        };
    }
    const gap = targetAmount - availableSavings;
    // If no surplus data, we can only report the gap
    if (!surplus || surplus <= 0) {
        return {
            targetAmount,
            currency,
            currentSurplus: surplus,
            surplusCurrency: homeCurrency,
            currentSavings: availableSavings,
            savingsCurrency: homeCurrency,
            timeHorizonMonths,
            requiredMonthlySaving: null,
            monthsRequiredAtCurrentSurplus: null,
            feasible: false,
            canAlreadyAfford: false,
            explanation: `Need ${currency} ${fmt(gap)} more. No monthly surplus data available to project a timeline.`,
        };
    }
    const monthsAtCurrentSurplus = Math.ceil(gap / surplus);
    const requiredMonthlySaving = timeHorizonMonths
        ? Math.ceil(gap / timeHorizonMonths)
        : null;
    const feasible = timeHorizonMonths
        ? requiredMonthlySaving <= surplus
        : true; // Always feasible if we just report how long it takes
    const explanation = timeHorizonMonths
        ? feasible
            ? `You need ${currency} ${fmt(gap)} more. At your current surplus of ${homeCurrency} ${fmt(surplus)}/month, you can reach this in ${monthsAtCurrentSurplus} months (within your ${timeHorizonMonths}-month window).`
            : `You need ${currency} ${fmt(gap)} more. To hit the target in ${timeHorizonMonths} months, you'd need to save ${homeCurrency} ${fmt(requiredMonthlySaving)}/month — your current surplus is ${homeCurrency} ${fmt(surplus)}/month. You're ${homeCurrency} ${fmt(requiredMonthlySaving - surplus)}/month short.`
        : `You need ${currency} ${fmt(gap)} more. At your current surplus of ${homeCurrency} ${fmt(surplus)}/month, you could reach this target in approximately ${monthsAtCurrentSurplus} months.`;
    return {
        targetAmount,
        currency,
        currentSurplus: surplus,
        surplusCurrency: homeCurrency,
        currentSavings: availableSavings,
        savingsCurrency: homeCurrency,
        timeHorizonMonths,
        requiredMonthlySaving,
        monthsRequiredAtCurrentSurplus: monthsAtCurrentSurplus,
        feasible,
        canAlreadyAfford: false,
        explanation,
    };
}
