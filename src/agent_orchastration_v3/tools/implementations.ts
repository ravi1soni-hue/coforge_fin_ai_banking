/**
 * V3 Tool Implementations — deterministic TypeScript functions.
 *
 * Every tool here is pure computation: no LLM calls, no side effects.
 * Results are returned as plain JSON objects that get injected back into
 * the LLM's context as tool messages.
 *
 * The LLM decides WHEN to call these; TypeScript decides WHAT they return.
 */

import axios from "axios";
import type { UserProfile } from "../../agent_orchastration_v2/types.js";
import { computeAffordabilityVerdict } from "../../agent_orchastration_v2/responseGenerators.js";
import { FxAdapter } from "../../agent_orchastration/services/marketData.adapters.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number): string => Math.round(n).toLocaleString("en-GB");

/**
 * Parse a natural-language time horizon string to a number of months.
 * Returns undefined if the string cannot be parsed.
 */
function parseTimeHorizonToMonths(timeHorizon: string): number | undefined {
  const s = timeHorizon.toLowerCase().trim();

  // "N month(s)"
  const monthMatch = s.match(/(\d+)\s*month/);
  if (monthMatch) return parseInt(monthMatch[1], 10);

  // "N year(s)"
  const yearMatch = s.match(/(\d+)\s*year/);
  if (yearMatch) return parseInt(yearMatch[1], 10) * 12;

  // "N week(s)"
  const weekMatch = s.match(/(\d+)\s*week/);
  if (weekMatch) return Math.ceil((parseInt(weekMatch[1], 10) * 7) / 30);

  // Common phrases
  if (/next year|in a year|1 year/.test(s)) return 12;
  if (/half.?year|6.?month/.test(s)) return 6;
  if (/quarter|3.?month/.test(s)) return 3;

  return undefined;
}

// ─── Tool: get_financial_profile ─────────────────────────────────────────────

export interface GetFinancialProfileArgs {
  userId: string;
}

export interface GetFinancialProfileResult {
  userId: string;
  availableSavings: number;
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  netMonthlySurplus: number | null;
  homeCurrency: string;
  userName: string | null;
  note: string;
}

/**
 * Returns the user's financial profile already loaded by the pipeline.
 * The profile is injected by the executor from the pre-loaded data.
 */
export function getFinancialProfile(
  args: GetFinancialProfileArgs,
  profile: UserProfile,
): GetFinancialProfileResult {
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

// ─── Tool: check_affordability ────────────────────────────────────────────────

export interface CheckAffordabilityArgs {
  userId: string;
  cost: number;
  currency: string;
}

export interface CheckAffordabilityResult {
  verdict: "COMFORTABLE" | "RISKY" | "CANNOT_AFFORD";
  availableSavings: number;
  savingsCurrency: string;
  cost: number;
  costCurrency: string;
  remainingAfterPayment: number;
  shortfall: number | null;
  emergencyBuffer: number;
  shouldSuggestInstalments: boolean;
  explanation: string;
}

/**
 * Computes affordability verdict using the same deterministic logic as V2.
 * Reuses computeAffordabilityVerdict from V2 responseGenerators to maintain
 * identical thresholds across both versions.
 */
export function checkAffordability(
  args: CheckAffordabilityArgs,
  profile: UserProfile,
): CheckAffordabilityResult {
  const { cost, currency } = args;
  const { availableSavings, netMonthlySurplus, homeCurrency } = profile;

  const verdict = computeAffordabilityVerdict(profile, { goalType: "PURCHASE", cost, currency });

  const remaining = availableSavings - cost;
  const emergencyBuffer =
    netMonthlySurplus && netMonthlySurplus > 0
      ? netMonthlySurplus * 3
      : availableSavings * 0.2;

  const explanation =
    verdict === "COMFORTABLE"
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

// ─── Tool: generate_emi_plan ──────────────────────────────────────────────────

export interface GenerateEmiPlanArgs {
  userId: string;
  cost: number;
  currency: string;
  months?: number;
}

export interface EmiOption {
  months: number;
  monthlyPayment: number;
  totalCost: number;
  savingsUntouched: number;
  savingsCurrency: string;
  label: string;
}

export interface GenerateEmiPlanResult {
  cost: number;
  currency: string;
  requestedMonths: number | null;
  plans: EmiOption[];
  savingsProtected: boolean;
  whyInstalments: string;
}

/**
 * Generates EMI plan options using the same formulas as V2's generatePlanSimulation.
 * All values are pre-computed — the LLM only formats the narrative.
 */
export function generateEmiPlan(
  args: GenerateEmiPlanArgs,
  profile: UserProfile,
): GenerateEmiPlanResult {
  const { cost, currency } = args;
  const { availableSavings, homeCurrency } = profile;

  const upfrontRemaining = availableSavings - cost;
  const canAffordLumpSum = upfrontRemaining >= 0;

  const whyInstalments = canAffordLumpSum
    ? `Paying upfront would reduce savings to ${homeCurrency} ${fmt(upfrontRemaining)}, reducing the emergency cushion. Instalments keep savings intact.`
    : `A lump-sum payment is not viable — shortfall of ${homeCurrency} ${fmt(Math.abs(upfrontRemaining))}. Instalments spread the cost over time.`;

  const durations = args.months ? [args.months] : [3, 6, 12];
  const plans: EmiOption[] = durations.map((m) => ({
    months: m,
    monthlyPayment: Math.ceil(cost / m),
    totalCost: cost,
    savingsUntouched: availableSavings,
    savingsCurrency: homeCurrency,
    label:
      m === 3 ? "Short-term — finish quickly" :
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

// ─── Tool: calculate_savings_projection ──────────────────────────────────────

export interface CalculateSavingsProjectionArgs {
  userId: string;
  targetAmount: number;
  currency: string;
  timeHorizon?: string;
}

export interface CalculateSavingsProjectionResult {
  targetAmount: number;
  currency: string;
  currentSurplus: number | null;
  surplusCurrency: string;
  currentSavings: number;
  savingsCurrency: string;
  timeHorizonMonths: number | null;
  requiredMonthlySaving: number | null;
  monthsRequiredAtCurrentSurplus: number | null;
  feasible: boolean;
  canAlreadyAfford: boolean;
  explanation: string;
}

/**
 * Determines feasibility of reaching a savings target.
 * All arithmetic is deterministic — zero LLM involvement.
 */
export function calculateSavingsProjection(
  args: CalculateSavingsProjectionArgs,
  profile: UserProfile,
): CalculateSavingsProjectionResult {
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
    ? requiredMonthlySaving! <= surplus
    : true; // Always feasible if we just report how long it takes

  const explanation = timeHorizonMonths
    ? feasible
      ? `You need ${currency} ${fmt(gap)} more. At your current surplus of ${homeCurrency} ${fmt(surplus)}/month, you can reach this in ${monthsAtCurrentSurplus} months (within your ${timeHorizonMonths}-month window).`
      : `You need ${currency} ${fmt(gap)} more. To hit the target in ${timeHorizonMonths} months, you'd need to save ${homeCurrency} ${fmt(requiredMonthlySaving!)}/month — your current surplus is ${homeCurrency} ${fmt(surplus)}/month. You're ${homeCurrency} ${fmt(requiredMonthlySaving! - surplus)}/month short.`
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

// ─── Tool: fetch_live_price ───────────────────────────────────────────────────

export interface FetchLivePriceArgs {
  query: string;
}

export interface ExtractedPrice {
  amount: number;
  currency: string;
  label: string;
}

export interface FetchLivePriceResult {
  query: string;
  priceRange: { min: number; max: number; currency: string } | null;
  extractedPrices: ExtractedPrice[];
  rawAbstract: string | null;
  confidence: "confirmed" | "partial" | "none";
  searchedAt: string;
  note: string;
}

// Private helpers (no LangChain dependency — pure HTTP + regex)
const YEAR_SET = new Set([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);

const extractPricesFromText = (text: string): ExtractedPrice[] => {
  const results: ExtractedPrice[] = [];
  const pattern = /([£$€])([\d,]+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const sym = m[1];
    const raw = m[2].replace(/,/g, "");
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000_000) continue;
    if (YEAR_SET.has(amount)) continue;
    const currency = sym === "£" ? "GBP" : sym === "$" ? "USD" : "EUR";
    results.push({ amount, currency, label: "text_extracted" });
  }
  return results;
};

const extractPricesFromInfobox = (
  content: Array<{ label?: string; value?: string }>,
): ExtractedPrice[] => {
  const PRICE_LABELS = /price|cost|msrp|rrp|starting|from|fee/i;
  const results: ExtractedPrice[] = [];
  for (const item of content) {
    if (!item.label || !item.value || !PRICE_LABELS.test(item.label)) continue;
    for (const p of extractPricesFromText(item.value)) results.push({ ...p, label: item.label });
  }
  return results;
};

const buildPriceRange = (
  prices: ExtractedPrice[],
): { min: number; max: number; currency: string } | null => {
  if (prices.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const p of prices) counts[p.currency] = (counts[p.currency] ?? 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const amounts = prices.filter((p) => p.currency === dominant).map((p) => p.amount);
  if (amounts.length === 0) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts), currency: dominant };
};

/**
 * Calls DuckDuckGo Instant Answer API to find the price / cost of something.
 * The LLM provides the search query as a tool argument — no second LLM call needed here.
 * Returns null priceRange + confidence="none" on any failure instead of throwing.
 */
export async function fetchLivePrice(args: FetchLivePriceArgs): Promise<FetchLivePriceResult> {
  const { query } = args;
  const searchedAt = new Date().toISOString();

  try {
    type DdgResponse = {
      Abstract?: string;
      AbstractText?: string;
      Answer?: string;
      RelatedTopics?: Array<{ Text?: string }>;
      Infobox?: { content?: Array<{ label?: string; value?: string }> };
    };

    const response = await axios.get<DdgResponse>("https://api.duckduckgo.com/", {
      params: {
        q: query,
        format: "json",
        no_redirect: "1",
        no_html: "1",
        skip_disambig: "1",
      },
      timeout: 8000,
      headers: { "Accept-Encoding": "gzip", "User-Agent": "BankingAssistant/1.0 (research)" },
    });

    const data = response.data;
    const allPrices: ExtractedPrice[] = [];

    const infoboxPrices = extractPricesFromInfobox(data.Infobox?.content ?? []);
    allPrices.push(...infoboxPrices);

    const textSources = [data.Answer ?? "", data.AbstractText ?? "", data.Abstract ?? ""]
      .filter(Boolean)
      .join(" ");
    allPrices.push(...extractPricesFromText(textSources));

    const topicTexts = (data.RelatedTopics ?? [])
      .slice(0, 10)
      .map((t) => t.Text ?? "")
      .join(" ");
    allPrices.push(...extractPricesFromText(topicTexts));

    const priceRange = buildPriceRange(allPrices);
    const confidence: "confirmed" | "partial" | "none" =
      infoboxPrices.length > 0 || (data.Answer && allPrices.length > 0)
        ? "confirmed"
        : allPrices.length > 0
          ? "partial"
          : "none";

    return {
      query,
      priceRange,
      extractedPrices: allPrices,
      rawAbstract: data.AbstractText ?? data.Abstract ?? null,
      confidence,
      searchedAt,
      note:
        priceRange != null
          ? `Found price range ${priceRange.currency} ${Math.round(priceRange.min).toLocaleString("en-GB")}–${Math.round(priceRange.max).toLocaleString("en-GB")} (confidence: ${confidence}).`
          : "No price data found. Ask the user to provide the amount.",
    };
  } catch {
    return {
      query,
      priceRange: null,
      extractedPrices: [],
      rawAbstract: null,
      confidence: "none",
      searchedAt,
      note: "Price lookup failed. Ask the user to provide the amount.",
    };
  }
}

// ─── Tool: fetch_market_data ──────────────────────────────────────────────────

export interface FetchMarketDataArgs {
  fromCurrency: string;
  toCurrency: string;
}

export interface FetchMarketDataResult {
  pair: string;
  rate: number | null;
  asOf: string | null;
  source: string;
  confidence: string;
  note: string;
}

const _fxAdapter = new FxAdapter();

/**
 * Fetches the live FX exchange rate between two currencies via Frankfurter API.
 * Reuses the existing FxAdapter so the same timeout / error-handling applies.
 */
export async function fetchMarketData(args: FetchMarketDataArgs): Promise<FetchMarketDataResult> {
  const result = await _fxAdapter.getRate(args.fromCurrency, args.toCurrency);
  return {
    pair: result.pair,
    rate: result.rate ?? null,
    asOf: result.asOf ?? null,
    source: result.source,
    confidence: result.confidence.label,
    note:
      result.rate != null
        ? `1 ${args.fromCurrency.toUpperCase()} = ${result.rate} ${args.toCurrency.toUpperCase()} (as of ${result.asOf ?? "today"}, source: ${result.source}).`
        : `FX rate for ${result.pair} unavailable. Use the user's home currency for calculations.`,
  };
}
