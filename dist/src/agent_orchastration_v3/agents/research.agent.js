/**
 * Research Agent — parallel data gathering.
 *
 * Executes three sub-tasks in parallel (based on the supervisor's plan):
 *   1. Price research  — web search + LLM to extract/confirm product price
 *   2. FX conversion   — real-time rate from Frankfurter API
 *   3. News context    — web search + LLM to summarise relevant financial news
 *
 * Each sub-task uses real APIs (not static data) and the LLM for intelligent
 * extraction/summarisation, making results adaptive to any query.
 */
import { searchWeb } from "../tools/webSearch.js";
import { getExchangeRate } from "../tools/exchangeRate.js";
// ─── Price sub-agent ─────────────────────────────────────────────────────────
async function researchPrice(llmClient, searchQuery, priceCurrency) {
    console.log(`[ResearchAgent:Price] Searching for: "${searchQuery}"`);
    const resolvedCurrency = priceCurrency ?? "GBP";
    const noDataFallback = `No web data available — return {"price": 0, "currency": "${resolvedCurrency}", "source": "web_search", "confidence": "low"}.`;
    // 1. Get web data from Serper.dev (Google Search, UK results)
    // Don't append "UK price buy" if it already has UK context or is a travel query
    const isTravel = /trip|holiday|hotel|flight|travel|vacation/i.test(searchQuery);
    const hasUk = /\buk\b/i.test(searchQuery);
    const ukQuery = hasUk ? searchQuery : isTravel ? `${searchQuery} UK cost 2025` : `${searchQuery} UK price`;
    const webData = await searchWeb(ukQuery);
    const webContext = [
        webData.abstract,
        webData.answer,
        ...webData.relatedTopics,
    ]
        .filter(Boolean)
        .join("\n");
    console.log(`[ResearchAgent:Price] Web context length: ${webContext.length} chars`);
    // 2. Ask LLM to extract/estimate the price using web data + its knowledge
    const messages = [
        {
            role: "system",
            content: `You are a product price researcher. Extract the current retail price strictly from the web data provided below.

Respond with ONLY this JSON (no explanation, no markdown):
{"price": <number>, "currency": "<3-letter ISO code>", "source": "web_search", "confidence": "<'high'|'medium'|'low'>"}

Rules:
- price must be a number (no currency symbols)
- currency should be the ISO 4217 code (EUR, GBP, USD, etc.)
- source is ALWAYS "web_search" — do NOT use your training knowledge to invent or estimate a price
- confidence = 'high' if exact price found, 'medium' if approximate, 'low' if unclear
- If no price can be found in the web data, return {"price": 0, "currency": "${resolvedCurrency}", "source": "web_search", "confidence": "low"}
- NEVER guess or fabricate a price — if uncertain, return price: 0`,
        },
        {
            role: "user",
            content: `Product search: "${searchQuery}"
Expected currency: ${resolvedCurrency}

Web search results:
${webContext || noDataFallback}

Extract the current retail price strictly from the web data above. Do NOT use training knowledge to estimate a price.`,
        },
    ];
    let parsed = null;
    try {
        parsed = await llmClient.chatJSON(messages);
    }
    catch { /* fall through */ }
    if (parsed?.price && Number(parsed.price) > 0) {
        const src = parsed.source;
        const conf = parsed.confidence;
        console.log(`[ResearchAgent:Price] Found: ${parsed.price} ${parsed.currency} (${src}, ${conf})`);
        return {
            price: Number(parsed.price),
            currency: String(parsed.currency ?? priceCurrency ?? "GBP").toUpperCase(),
            source: src === "web_search" ? "web_search" : "llm_knowledge",
            confidence: (["high", "medium", "low"].includes(conf) ? conf : "medium"),
            rawContext: webContext.slice(0, 600),
        };
    }
    console.warn("[ResearchAgent:Price] Could not extract price from web data — returning 0 to avoid hallucination");
    return {
        price: 0,
        currency: priceCurrency ?? "GBP",
        source: "web_search",
        confidence: "low",
        rawContext: webContext.slice(0, 300),
    };
}
// ─── FX sub-agent ────────────────────────────────────────────────────────────
async function researchFx(from, to) {
    console.log(`[ResearchAgent:FX] Fetching rate: ${from} → ${to}`);
    try {
        const rate = await getExchangeRate(from, to);
        console.log(`[ResearchAgent:FX] Rate ${from}→${to}: ${rate}`);
        return { rate, from: from.toUpperCase(), to: to.toUpperCase() };
    }
    catch (err) {
        console.error("[ResearchAgent:FX] Failed:", err);
        return null;
    }
}
// ─── News sub-agent ──────────────────────────────────────────────────────────
async function researchNews(llmClient, product) {
    const query = product
        ? `${product} UK price market news 2025`
        : "UK consumer finance news 2025";
    console.log(`[ResearchAgent:News] Searching for news: "${query}"`);
    const webData = await searchWeb(query);
    const rawText = [webData.abstract, webData.answer, ...webData.relatedTopics]
        .filter(Boolean)
        .join("\n");
    const messages = [
        {
            role: "system",
            content: `You are a financial news analyst. Summarise the key news and market context from the web data.

Respond with ONLY this JSON (no explanation, no markdown):
{"headlines": ["<headline 1>", "<headline 2>", "<headline 3>"], "context": "<2-3 sentence summary of key financial context>"}`,
        },
        {
            role: "user",
            content: `Web search data about "${product ?? "UK consumer finance"}":
${rawText || "Limited news data — provide general context from your knowledge."}

Summarise the most relevant financial news and market context.`,
        },
    ];
    let parsed = null;
    try {
        parsed = await llmClient.chatJSON(messages);
    }
    catch { /* fall through */ }
    return {
        headlines: Array.isArray(parsed?.headlines) ? parsed.headlines.slice(0, 3) : [],
        context: typeof parsed?.context === "string" ? parsed.context : "Market conditions appear stable.",
    };
}
export async function runResearchAgent(llmClient, plan) {
    // If the user stated a price explicitly, use it directly — no web search needed.
    const statedPrice = plan.userStatedPrice ?? 0;
    const userStatedPriceInfo = statedPrice > 0
        ? {
            price: statedPrice,
            currency: (plan.priceCurrency ?? plan.userHomeCurrency ?? "GBP").toUpperCase(),
            source: "user_stated",
            confidence: "high",
            rawContext: `User stated price: ${statedPrice}`,
        }
        : null;
    const tasks = [
        userStatedPriceInfo
            ? Promise.resolve(userStatedPriceInfo)
            : plan.needsWebSearch && plan.searchQuery
                ? researchPrice(llmClient, plan.searchQuery, plan.priceCurrency)
                : Promise.resolve(null),
        plan.needsFxConversion && plan.priceCurrency && plan.targetCurrency
            ? researchFx(plan.priceCurrency, plan.targetCurrency)
            : Promise.resolve(null),
        plan.needsNews
            ? researchNews(llmClient, plan.product)
            : Promise.resolve(null),
    ];
    const [priceInfo, fxInfo, newsInfo] = await Promise.all(tasks);
    return { priceInfo, fxInfo, newsInfo };
}
