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
import { computeAffordabilityVerdict } from "../../agent_orchastration_v2/responseGenerators.js";
import { FxAdapter } from "../../agent_orchastration/services/marketData.adapters.js";
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
// Private helpers (no LangChain dependency — pure HTTP + regex)
const YEAR_SET = new Set([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
const extractPricesFromText = (text) => {
    const results = [];
    const pattern = /([£$€])([\d,]+(?:\.\d{1,2})?)/g;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        const sym = m[1];
        const raw = m[2].replace(/,/g, "");
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000_000)
            continue;
        if (YEAR_SET.has(amount))
            continue;
        const currency = sym === "£" ? "GBP" : sym === "$" ? "USD" : "EUR";
        results.push({ amount, currency, label: "text_extracted" });
    }
    return results;
};
const extractPricesFromInfobox = (content) => {
    const PRICE_LABELS = /price|cost|msrp|rrp|starting|from|fee/i;
    const results = [];
    for (const item of content) {
        if (!item.label || !item.value || !PRICE_LABELS.test(item.label))
            continue;
        for (const p of extractPricesFromText(item.value))
            results.push({ ...p, label: item.label });
    }
    return results;
};
const buildPriceRange = (prices) => {
    if (prices.length === 0)
        return null;
    const counts = {};
    for (const p of prices)
        counts[p.currency] = (counts[p.currency] ?? 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const amounts = prices.filter((p) => p.currency === dominant).map((p) => p.amount);
    if (amounts.length === 0)
        return null;
    return { min: Math.min(...amounts), max: Math.max(...amounts), currency: dominant };
};
/**
 * Calls DuckDuckGo Instant Answer API to find the price / cost of something.
 * The LLM provides the search query as a tool argument — no second LLM call needed here.
 * Returns null priceRange + confidence="none" on any failure instead of throwing.
 */
export async function fetchLivePrice(args) {
    const { query } = args;
    const searchedAt = new Date().toISOString();
    try {
        const response = await axios.get("https://api.duckduckgo.com/", {
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
        const allPrices = [];
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
        const confidence = infoboxPrices.length > 0 || (data.Answer && allPrices.length > 0)
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
            note: priceRange != null
                ? `Found price range ${priceRange.currency} ${Math.round(priceRange.min).toLocaleString("en-GB")}–${Math.round(priceRange.max).toLocaleString("en-GB")} (confidence: ${confidence}).`
                : "No price data found. Ask the user to provide the amount.",
        };
    }
    catch {
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
const _fxAdapter = new FxAdapter();
/**
 * Fetches the live FX exchange rate between two currencies via Frankfurter API.
 * Reuses the existing FxAdapter so the same timeout / error-handling applies.
 */
export async function fetchMarketData(args) {
    const result = await _fxAdapter.getRate(args.fromCurrency, args.toCurrency);
    return {
        pair: result.pair,
        rate: result.rate ?? null,
        asOf: result.asOf ?? null,
        source: result.source,
        confidence: result.confidence.label,
        note: result.rate != null
            ? `1 ${args.fromCurrency.toUpperCase()} = ${result.rate} ${args.toCurrency.toUpperCase()} (as of ${result.asOf ?? "today"}, source: ${result.source}).`
            : `FX rate for ${result.pair} unavailable. Use the user's home currency for calculations.`,
    };
}
const decodeXmlEntities = (s) => s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
const stripHtmlTags = (s) => s.replace(/<[^>]*>/g, "").trim();
/**
 * Pulls latest headlines from Google News RSS for a topic.
 * No API key required; returns best-effort results and degrades gracefully.
 */
export async function fetchFinancialNews(args) {
    const topic = (args.topic ?? "financial markets").trim() || "financial markets";
    const region = (args.region ?? "UK").trim() || "UK";
    const maxItems = Math.min(Math.max(args.maxItems ?? 5, 1), 10);
    const fetchedAt = new Date().toISOString();
    try {
        const query = encodeURIComponent(`${topic} ${region} finance`);
        const url = `https://news.google.com/rss/search?q=${query}&hl=en-GB&gl=GB&ceid=GB:en`;
        const response = await axios.get(url, {
            timeout: 8000,
            responseType: "text",
            headers: {
                "User-Agent": "BankingAssistant/1.0 (news)",
            },
        });
        const xml = response.data;
        const itemBlocks = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((m) => m[1]);
        const items = itemBlocks.slice(0, maxItems).map((block) => {
            const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Untitled";
            const rawLink = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
            const rawPubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
            const rawSource = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "Google News";
            return {
                title: decodeXmlEntities(stripHtmlTags(rawTitle)),
                url: rawLink ? decodeXmlEntities(rawLink) : null,
                publishedAt: rawPubDate ? new Date(rawPubDate).toISOString() : null,
                source: decodeXmlEntities(stripHtmlTags(rawSource)),
            };
        });
        return {
            topic,
            region,
            count: items.length,
            items,
            fetchedAt,
            note: items.length > 0
                ? `Fetched ${items.length} recent headline(s) for ${topic} (${region}).`
                : `No recent headlines found for ${topic} (${region}).`,
        };
    }
    catch {
        return {
            topic,
            region,
            count: 0,
            items: [],
            fetchedAt,
            note: `News lookup unavailable right now for ${topic}. Continue without news context.`,
        };
    }
}
