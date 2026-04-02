/**
 * webSearchAgent
 *
 * Performs a zero-API-key live price lookup using the DuckDuckGo Instant Answer API.
 * https://duckduckgo.com/api
 *
 * Only runs for affordability queries where the user has NOT already provided
 * a numeric target amount.  Never blocks the pipeline – any network/parse
 * failure results in confidence="none" and the rest of the engine gracefully
 * asks the user for the amount instead.
 */
import axios from "axios";
/* ─────────────────────────────────────── helpers ───────────────────────── */
/** Extract the first plausible location hint from free text. */
const extractLocationHint = (text) => {
    const match = text.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    return match?.[1]?.trim();
};
/** Extract day count from free text ("3 day", "three-day", "5 days"). */
const extractDaysHint = (text) => {
    const match = text.match(/(\d+)\s*[-\s]?(?:day|days)/i);
    return match ? Math.min(30, Math.max(1, Number(match[1]))) : undefined;
};
/** Recognise common consumer device names. */
const extractDeviceHint = (text) => {
    const patterns = [
        /\b(iphone\s*\d+\s*(?:pro|plus|max|mini)?)/i,
        /\b(samsung\s+galaxy\s+[a-z]+\s*\d+)/i,
        /\b(pixel\s*\d+\s*(?:pro|a)?)/i,
        /\b(macbook\s+(?:pro|air)?(?:\s+\d+(?:inch|")?)?)/i,
        /\b(surface\s+(?:pro|laptop)\s*\d*)/i,
        /\b(laptop)\b/i,
        /\b(tablet)\b/i,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m) {
            return m[1].trim();
        }
    }
    return undefined;
};
/** Build the best possible search query for the given state. Returns null when
 *  there is not enough context to produce a useful search. */
const buildSearchQuery = (state) => {
    // Only for affordability with missing target amount
    const queryType = typeof state.knownFacts?.queryType === "string"
        ? state.knownFacts.queryType
        : "";
    if (queryType !== "affordability") {
        return null;
    }
    const hasUserAmount = typeof state.knownFacts?.targetAmount === "number" &&
        state.knownFacts.targetAmount > 0;
    if (hasUserAmount) {
        return null; // User already told us the price – no need to search
    }
    const goalType = typeof state.knownFacts?.goalType === "string"
        ? state.knownFacts.goalType.toLowerCase()
        : "";
    const destination = typeof state.knownFacts?.destination === "string"
        ? state.knownFacts.destination
        : undefined;
    const year = new Date().getFullYear();
    // ─────────────────────────────────────────────────────────────
    // Vehicles
    // ─────────────────────────────────────────────────────────────
    if (goalType === "car") {
        return `average new car price ${year}`;
    }
    if (goalType === "bike" || goalType === "motorcycle") {
        return `average motorcycle price ${year}`;
    }
    // ─────────────────────────────────────────────────────────────
    // Real Estate
    // ─────────────────────────────────────────────────────────────
    if (goalType === "house" || goalType === "property") {
        const loc = destination ?? extractLocationHint(state.question);
        return loc
            ? `average house price ${loc} ${year}`
            : `average house price ${year}`;
    }
    // ─────────────────────────────────────────────────────────────
    // Electronics & Appliances
    // ─────────────────────────────────────────────────────────────
    if (goalType === "electronics" || goalType === "appliance") {
        const device = extractDeviceHint(state.question);
        return device ? `${device} price ${year}` : null;
    }
    // Phone specifically (separate from generic electronics)
    if (goalType === "phone" || goalType === "smartphone") {
        const device = extractDeviceHint(state.question);
        if (device) {
            return `${device} price ${year}`;
        }
        // If no specific device model found, search for generic smartphone
        return `average smartphone price ${year}`;
    }
    // ─────────────────────────────────────────────────────────────
    // Education
    // ─────────────────────────────────────────────────────────────
    if (goalType === "education" || goalType === "course") {
        const courseType = destination ?? extractLocationHint(state.question) ?? "online course";
        return `${courseType} average cost ${year}`;
    }
    // ─────────────────────────────────────────────────────────────
    // Life Events
    // ─────────────────────────────────────────────────────────────
    if (goalType === "wedding") {
        const loc = destination ?? extractLocationHint(state.question);
        return loc
            ? `average wedding cost ${loc} ${year}`
            : `average wedding cost ${year}`;
    }
    if (goalType === "medical") {
        return `average medical procedure cost ${year}`;
    }
    // ─────────────────────────────────────────────────────────────
    // Trips / Holidays
    // ─────────────────────────────────────────────────────────────
    const dest = destination ?? extractLocationHint(state.question);
    const days = extractDaysHint(state.question);
    const isTrip = /\btrip\b|\bholiday\b|\bvacation\b|\bbeach\b|\btravel\b/i.test(state.question);
    if (isTrip && dest) {
        const daysPart = days ? `${days} day ` : "";
        return `${daysPart}trip to ${dest} average cost ${year}`;
    }
    if (isTrip) {
        const days = extractDaysHint(state.question);
        return days ? `${days} day holiday average cost ${year}` : null;
    }
    // ─────────────────────────────────────────────────────────────
    // Fallback: use intent subject if available
    // ─────────────────────────────────────────────────────────────
    if (state.intent?.subject) {
        return `${state.intent.subject} price ${year}`;
    }
    return null;
};
/* ─────────────────────────────────────── price extraction ──────────────── */
const YEAR_SET = new Set([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
const extractPricesFromText = (text) => {
    const results = [];
    // Matches £1,200 / $1,200.50 / €999 and their "from $X" / "starting $X" variants
    const pattern = /([£$€])([\d,]+(?:\.\d{1,2})?)/g;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        const sym = m[1];
        const raw = m[2].replace(/,/g, "");
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000_000) {
            continue;
        }
        // Skip values that look like calendar years
        if (YEAR_SET.has(amount)) {
            continue;
        }
        const currency = sym === "£" ? "GBP" : sym === "$" ? "USD" : "EUR";
        results.push({ amount, currency, label: "text_extracted" });
    }
    return results;
};
const extractPricesFromInfobox = (content) => {
    const PRICE_LABELS = /price|cost|msrp|rrp|starting|from|fee/i;
    const results = [];
    for (const item of content) {
        if (!item.label || !item.value || !PRICE_LABELS.test(item.label)) {
            continue;
        }
        const prices = extractPricesFromText(item.value);
        for (const p of prices) {
            results.push({ ...p, label: item.label });
        }
    }
    return results;
};
const buildPriceRange = (prices) => {
    if (prices.length === 0) {
        return undefined;
    }
    // Use the most frequently appearing currency
    const currencyCounts = {};
    for (const p of prices) {
        currencyCounts[p.currency] = (currencyCounts[p.currency] ?? 0) + 1;
    }
    const dominantCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0][0];
    const filtered = prices
        .filter((p) => p.currency === dominantCurrency)
        .map((p) => p.amount);
    if (filtered.length === 0) {
        return undefined;
    }
    return {
        min: Math.min(...filtered),
        max: Math.max(...filtered),
        currency: dominantCurrency,
    };
};
/* ─────────────────────────────────────── DDG fetch ────────────────────── */
const fetchDuckDuckGoAnswer = async (query) => {
    const response = await axios.get("https://api.duckduckgo.com/", {
        params: {
            q: query,
            format: "json",
            no_redirect: "1",
            no_html: "1",
            skip_disambig: "1",
        },
        timeout: 8000,
        headers: {
            "Accept-Encoding": "gzip",
            "User-Agent": "BankingAssistant/1.0 (research)",
        },
    });
    const data = response.data;
    const allPrices = [];
    // 1. Infobox structured data – highest confidence
    const infoboxPrices = extractPricesFromInfobox(data.Infobox?.content ?? []);
    allPrices.push(...infoboxPrices);
    // 2. Direct answer & abstract text
    const textSources = [
        data.Answer ?? "",
        data.AbstractText ?? "",
        data.Abstract ?? "",
    ]
        .filter(Boolean)
        .join(" ");
    const textPrices = extractPricesFromText(textSources);
    allPrices.push(...textPrices);
    // 3. Related topic snippets (capped at 10 to avoid noise)
    const topicTexts = (data.RelatedTopics ?? [])
        .slice(0, 10)
        .map((t) => t.Text ?? "")
        .join(" ");
    const topicPrices = extractPricesFromText(topicTexts);
    allPrices.push(...topicPrices);
    const priceRange = buildPriceRange(allPrices);
    // Determine confidence
    let confidence = "none";
    if (infoboxPrices.length > 0 || (data.Answer && allPrices.length > 0)) {
        confidence = "confirmed";
    }
    else if (allPrices.length > 0) {
        confidence = "partial";
    }
    const rawAbstract = data.AbstractText ?? data.Abstract ?? undefined;
    return { rawAbstract, extractedPrices: allPrices, priceRange, confidence };
};
/* ─────────────────────────────────────── agent ────────────────────────── */
export const webSearchAgent = async (state, _config) => {
    const query = buildSearchQuery(state);
    if (!query) {
        // Nothing to search – skip silently
        return {};
    }
    console.log(`[webSearchAgent] DDG search: "${query}"`);
    try {
        const result = await fetchDuckDuckGoAnswer(query);
        console.log(`[webSearchAgent] confidence=${result.confidence} prices=${result.extractedPrices.length}`);
        return {
            priceSearchResult: {
                query,
                source: "duckduckgo_ia",
                rawAbstract: result.rawAbstract,
                extractedPrices: result.extractedPrices,
                priceRange: result.priceRange,
                confidence: result.confidence,
                searchedAt: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[webSearchAgent] DDG fetch failed: ${msg}`);
        return {
            priceSearchResult: {
                query,
                source: "duckduckgo_ia",
                extractedPrices: [],
                confidence: "none",
                searchedAt: new Date().toISOString(),
            },
        };
    }
};
