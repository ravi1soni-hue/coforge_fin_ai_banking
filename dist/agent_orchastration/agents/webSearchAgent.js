/**
 * webSearchAgent
 *
 * Performs a zero-API-key live price lookup using the DuckDuckGo Instant Answer API.
 * Uses the LLM to build the optimal search query from the user's natural language question.
 * Only runs for affordability queries where the user has NOT already provided a numeric target amount.
 * Never blocks the pipeline — any failure results in confidence="none" and the engine
 * falls back to asking the user for the amount.
 */
import axios from "axios";
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
        const prices = extractPricesFromText(item.value);
        for (const p of prices)
            results.push({ ...p, label: item.label });
    }
    return results;
};
const buildPriceRange = (prices) => {
    if (prices.length === 0)
        return undefined;
    const currencyCounts = {};
    for (const p of prices) {
        currencyCounts[p.currency] = (currencyCounts[p.currency] ?? 0) + 1;
    }
    const dominantCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0][0];
    const filtered = prices
        .filter((p) => p.currency === dominantCurrency)
        .map((p) => p.amount);
    if (filtered.length === 0)
        return undefined;
    return {
        min: Math.min(...filtered),
        max: Math.max(...filtered),
        currency: dominantCurrency,
    };
};
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
export const webSearchAgent = async (state, config) => {
    // Only run for affordability queries where the user has NOT already provided a numeric amount
    const queryType = typeof state.knownFacts?.queryType === "string" ? state.knownFacts.queryType : "";
    if (queryType !== "affordability")
        return {};
    const hasUserAmount = typeof state.knownFacts?.targetAmount === "number" &&
        state.knownFacts.targetAmount > 0;
    if (hasUserAmount)
        return {};
    const llm = config.configurable?.llm;
    if (!llm)
        return {};
    // Use LLM to build the best search query from the user's natural language question
    const rawQuery = await llm.generateText(`
You are building a web search query to find the realistic cost of what a user wants to purchase or plan for.

USER QUESTION: "${state.question}"
KNOWN FACTS: ${JSON.stringify(state.knownFacts, null, 2)}
CURRENT YEAR: ${new Date().getFullYear()}

Generate a single, concise search query (max 8 words) optimised for finding a realistic price or cost estimate.

Examples:
- 3 day trip to Paris average cost 2026
- iPhone 16 Pro price 2026
- average wedding cost London 2026
- new car price UK 2026

Reply with ONLY the search query string. No quotes, no explanation.
If there is not enough context to form a useful search query, reply with NO_SEARCH.
`);
    const query = rawQuery.trim();
    if (!query || query === "NO_SEARCH")
        return {};
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
