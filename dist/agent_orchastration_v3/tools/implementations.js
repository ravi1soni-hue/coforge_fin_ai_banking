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
    const { cost, currency, fxRate } = args;
    const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
    // Convert cost to home currency when currencies differ and an FX rate was supplied
    const needsConversion = currency !== homeCurrency && fxRate && fxRate > 0;
    const costInHomeCurrency = needsConversion ? cost * fxRate : cost;
    const verdict = computeAffordabilityVerdict(profile, { goalType: "PURCHASE", cost: costInHomeCurrency, currency: homeCurrency });
    const remaining = availableSavings - costInHomeCurrency;
    const emergencyBuffer = netMonthlySurplus && netMonthlySurplus > 0
        ? netMonthlySurplus * 3
        : availableSavings * 0.2;
    const displayCostLabel = needsConversion
        ? `${currency} ${fmt(cost)} (${homeCurrency} ${fmt(costInHomeCurrency)} after FX)`
        : `${currency} ${fmt(cost)}`;
    const explanation = verdict === "COMFORTABLE"
        ? `After paying ${displayCostLabel}, savings would be ${homeCurrency} ${fmt(remaining)}, well above the ${homeCurrency} ${fmt(emergencyBuffer)} emergency buffer.`
        : verdict === "RISKY"
            ? `After paying ${displayCostLabel}, savings would be ${homeCurrency} ${fmt(remaining)}, below the ${homeCurrency} ${fmt(emergencyBuffer)} emergency buffer. Risky but technically possible.`
            : `Cost of ${displayCostLabel} exceeds available savings of ${homeCurrency} ${fmt(availableSavings)} by ${homeCurrency} ${fmt(Math.abs(remaining))}.`;
    return {
        verdict,
        availableSavings,
        savingsCurrency: homeCurrency,
        costInHomeCurrency: Math.round(costInHomeCurrency),
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
/**
 * Known product price ranges in EUR (Europe retail).
 * Used as a fallback when the web search returns no price data.
 * Prices are approximate starting prices as of early 2026.
 */
const KNOWN_PRODUCT_PRICES = [
    // ── iPhone 17 series (released Sep 2025) ──
    {
        patterns: [/iphone\s*17\s*pro\s*max/i],
        priceRange: { min: 1629, max: 2299, currency: "EUR" },
        note: "iPhone 17 Pro Max starts from EUR 1,629 (256GB) in Europe.",
    },
    {
        patterns: [/iphone\s*17\s*pro(?!\s*max)/i],
        priceRange: { min: 1399, max: 1899, currency: "EUR" },
        note: "iPhone 17 Pro starts from EUR 1,399 (128GB) in Europe.",
    },
    {
        patterns: [/iphone\s*17\s*plus/i],
        priceRange: { min: 1099, max: 1399, currency: "EUR" },
        note: "iPhone 17 Plus starts from EUR 1,099 in Europe.",
    },
    {
        patterns: [/iphone\s*17(?!\s*(pro|plus))/i],
        priceRange: { min: 899, max: 1199, currency: "EUR" },
        note: "iPhone 17 starts from EUR 899 (128GB) in Europe.",
    },
    // ── iPhone 16 series ──
    {
        patterns: [/iphone\s*16\s*pro\s*max/i],
        priceRange: { min: 1479, max: 1969, currency: "EUR" },
        note: "iPhone 16 Pro Max starts from EUR 1,479 (256GB) in Europe.",
    },
    {
        patterns: [/iphone\s*16\s*pro(?!\s*max)/i],
        priceRange: { min: 1229, max: 1729, currency: "EUR" },
        note: "iPhone 16 Pro starts from EUR 1,229 (128GB) in Europe.",
    },
    {
        patterns: [/iphone\s*16(?!\s*pro)/i],
        priceRange: { min: 999, max: 1329, currency: "EUR" },
        note: "iPhone 16 starts from EUR 999 (128GB) in Europe.",
    },
    // ── iPhone 15 series ──
    {
        patterns: [/iphone\s*15\s*pro\s*max/i],
        priceRange: { min: 1329, max: 1709, currency: "EUR" },
        note: "iPhone 15 Pro Max starts from EUR 1,329 in Europe.",
    },
    {
        patterns: [/iphone\s*15\s*pro(?!\s*max)/i],
        priceRange: { min: 1199, max: 1629, currency: "EUR" },
        note: "iPhone 15 Pro starts from EUR 1,199 in Europe.",
    },
    // ── Samsung ──
    {
        patterns: [/samsung\s*(galaxy)?\s*s25\s*ultra/i],
        priceRange: { min: 1499, max: 1949, currency: "EUR" },
        note: "Samsung Galaxy S25 Ultra starts from EUR 1,499 in Europe.",
    },
    {
        patterns: [/samsung\s*(galaxy)?\s*s25\s*(plus|\+)/i],
        priceRange: { min: 1199, max: 1499, currency: "EUR" },
        note: "Samsung Galaxy S25+ starts from EUR 1,199 in Europe.",
    },
    {
        patterns: [/samsung\s*(galaxy)?\s*s25(?!\s*(ultra|plus|\+))/i],
        priceRange: { min: 899, max: 1199, currency: "EUR" },
        note: "Samsung Galaxy S25 starts from EUR 899 in Europe.",
    },
    // ── Apple Mac ──
    {
        patterns: [/macbook\s*pro/i],
        priceRange: { min: 1999, max: 3999, currency: "EUR" },
        note: "MacBook Pro M4 starts from EUR 1,999 in Europe.",
    },
    {
        patterns: [/macbook\s*air/i],
        priceRange: { min: 1299, max: 1899, currency: "EUR" },
        note: "MacBook Air M3/M4 starts from EUR 1,299 in Europe.",
    },
    {
        patterns: [/ipad\s*pro/i],
        priceRange: { min: 1099, max: 2299, currency: "EUR" },
        note: "iPad Pro M4 starts from EUR 1,099 in Europe.",
    },
    // ── Google ──
    {
        patterns: [/pixel\s*9\s*pro/i],
        priceRange: { min: 1099, max: 1449, currency: "EUR" },
        note: "Google Pixel 9 Pro starts from EUR 1,099 in Europe.",
    },
];
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
 * Searches DuckDuckGo HTML search results for price mentions.
 * Produces real web-sourced prices unlike the Instant Answer API.
 */
async function searchWebForPrices(query) {
    const response = await axios.post("https://html.duckduckgo.com/html/", new URLSearchParams({ q: query, kl: "uk-en" }), {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9",
        },
        timeout: 10000,
        maxRedirects: 5,
    });
    const raw = response.data;
    // Decode common HTML entities for currency symbols before stripping tags
    const decoded = raw
        .replace(/&euro;/g, "€")
        .replace(/&pound;/g, "£")
        .replace(/&#8364;/g, "€")
        .replace(/&#163;/g, "£")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ");
    // Extract only result snippet and title text to avoid noise from nav/ads
    const snippetChunks = [];
    for (const m of decoded.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)) {
        snippetChunks.push(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    }
    for (const m of decoded.matchAll(/class="result__title"[^>]*>([\s\S]*?)<\/[ah][^>]*>/g)) {
        snippetChunks.push(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    }
    // If no structured snippets found (different DDG layout), scan full stripped text
    const textToParse = snippetChunks.length > 0
        ? snippetChunks.join(" ")
        : decoded.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const prices = extractPricesFromText(textToParse);
    const snippet = snippetChunks[0] ?? null;
    return { prices, snippet };
}
/**
 * Fetches a live price estimate by doing a real web search (DuckDuckGo HTML).
 * Falls back to the KNOWN_PRODUCT_PRICES retail database only when the web
 * search returns no price data (network failure or no results).
 */
export async function fetchLivePrice(args) {
    const { query } = args;
    const searchedAt = new Date().toISOString();
    // ── 1. Try real web search ──────────────────────────────────────────────────
    try {
        const { prices: webPrices, snippet } = await searchWebForPrices(query);
        const priceRange = buildPriceRange(webPrices);
        if (priceRange !== null) {
            const confidence = webPrices.length >= 3 ? "confirmed" : "partial";
            return {
                query,
                priceRange,
                extractedPrices: webPrices,
                rawAbstract: snippet,
                confidence,
                searchedAt,
                note: `Web search found price range ${priceRange.currency} ${Math.round(priceRange.min).toLocaleString("en-GB")}–${Math.round(priceRange.max).toLocaleString("en-GB")} (confidence: ${confidence}, source: web).`,
            };
        }
    }
    catch {
        // Web search failed — fall through to retail database
    }
    // ── 2. Retail price database fallback ──────────────────────────────────────
    const queryLower = query.toLowerCase();
    for (const product of KNOWN_PRODUCT_PRICES) {
        if (product.patterns.some((p) => p.test(queryLower))) {
            return {
                query,
                priceRange: product.priceRange,
                extractedPrices: [
                    { amount: product.priceRange.min, currency: product.priceRange.currency, label: "retail_db_min" },
                    { amount: product.priceRange.max, currency: product.priceRange.currency, label: "retail_db_max" },
                ],
                rawAbstract: null,
                confidence: "partial",
                searchedAt,
                note: product.note + " (Source: retail price database — web search returned no data.)",
            };
        }
    }
    // ── 3. Complete failure ─────────────────────────────────────────────────────
    return {
        query,
        priceRange: null,
        extractedPrices: [],
        rawAbstract: null,
        confidence: "none",
        searchedAt,
        note: "No price data found via web search or retail database.",
    };
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
