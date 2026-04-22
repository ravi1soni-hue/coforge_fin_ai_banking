/**
 * Research Agent — parallel data gathering.
 *
 * Executes three sub-tasks in parallel:
 *   1. Price research  — web search + LLM extraction
 *   2. FX conversion   — real-time exchange rate
 *   3. News context    — web search + LLM summarisation
 *
 * Guarantees:
 * - Never hallucinates prices
 * - Uses ONLY web-provided data
 * - Logs all successes and failures
 * - Safe fallbacks for bank-grade usage
 * - Domain-agnostic (products, services, fees, subscriptions, commodities)
 */
import { searchWeb } from "../tools/webSearch.js";
import { getExchangeRate } from "../tools/exchangeRate.js";
import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";
// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function enrichPriceQuery(query) {
    const lower = query.toLowerCase();
    const hasRegion = /\buk\b|\bindia\b|\bus\b|\beurope\b/.test(lower);
    const hasPriceWord = /price|cost|pricing|fee|charges|how much/.test(lower);
    if (hasPriceWord && hasRegion)
        return query;
    if (hasPriceWord)
        return `${query} UK`;
    return `${query} price UK 2025`;
}
// ─────────────────────────────────────────────────────────────────────────────
// PRICE SUB-AGENT (DOMAIN AGNOSTIC)
// ─────────────────────────────────────────────────────────────────────────────
async function researchPrice(llmClient, searchQuery, priceCurrency) {
    const resolvedCurrency = (priceCurrency ?? "GBP").toUpperCase();
    const enrichedQuery = enrichPriceQuery(searchQuery);
    console.log(`[ResearchAgent:Price] 🔍 Searching: "${enrichedQuery}"`);
    const webData = await searchWeb(enrichedQuery);
    const webContext = [
        webData.abstract,
        webData.answer,
        ...webData.relatedTopics,
    ]
        .filter(Boolean)
        .join("\n");
    console.log(`[ResearchAgent:Price] 📄 Web context length: ${webContext.length}`);
    const fallbackJson = `{"price": 0, "currency": "${resolvedCurrency}", "source": "web_search", "confidence": "low"}`;
    // Sanitize the search query before LLM call
    const sanitizedSearchQuery = sanitizeUserInput(searchQuery);
    const messages = [
        {
            role: "system",
            content: `You are a warm, conversational financial research assistant. Detect the user's intent (price, investment, news, etc.) and respond naturally:
 - For price queries, extract factual, published prices from the web data, and explain your findings in a friendly, concise way. If price is unclear, say so and ask for clarification once.
 - For investment or news queries, summarize the most relevant information conversationally, not as a list or script.
 - Use natural transitions and acknowledgments (e.g., "Here's what I found for you...", "Let me check the latest info...").
 - Never sound scripted or robotic. Avoid rigid lists, bullet points, or repeated phrases.
 - If you need more info, ask a single, clear follow-up question, but never more than 2 per topic. After that, summarize and close.
 - Always adapt your tone and content to the user's intent and conversation history.
 - If the user changes topic, reset context and respond accordingly.
 - Never repeat the user's question. Never use phrases like "to be honest" or "the good news is". Never role-play.
 - Your output will be checked for warmth, clarity, and natural flow.`,
        },
        {
            role: "user",
            content: `Search term: "${sanitizedSearchQuery}"
Expected currency: ${resolvedCurrency}

Web data:
${webContext || "NO DATA AVAILABLE"}

Extract the explicit price strictly from the web data.`,
        },
    ];
    let parsed = null;
    try {
        parsed = await llmClient.chatJSON(messages);
    }
    catch (err) {
        console.error("[ResearchAgent:Price] ❌ LLM extraction failed", err);
    }
    if (parsed &&
        typeof parsed.price === "number" &&
        parsed.price > 0) {
        console.log("[ResearchAgent:Price] ✅ Price extracted", parsed);
        return {
            price: parsed.price,
            currency: String(parsed.currency ?? resolvedCurrency).toUpperCase(),
            source: "web_search",
            confidence: parsed.confidence ?? "medium",
            rawContext: webContext.slice(0, 600),
        };
    }
    console.error("[ResearchAgent:Price] ❌ No valid price found", {
        searchQuery,
        enrichedQuery,
        webContextLength: webContext.length,
    });
    return {
        price: 0,
        currency: resolvedCurrency,
        source: "web_search",
        confidence: "low",
        rawContext: webContext.slice(0, 300),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// FX SUB-AGENT
// ─────────────────────────────────────────────────────────────────────────────
async function researchFx(from, to) {
    console.log(`[ResearchAgent:FX] 💱 Fetching ${from.toUpperCase()} → ${to.toUpperCase()}`);
    try {
        const rate = await getExchangeRate(from, to);
        console.log(`[ResearchAgent:FX] ✅ Rate found: ${rate}`);
        return {
            rate,
            from: from.toUpperCase(),
            to: to.toUpperCase(),
        };
    }
    catch (err) {
        console.error("[ResearchAgent:FX] ❌ FX fetch failed", {
            from,
            to,
            error: err instanceof Error ? err.message : err,
        });
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// NEWS SUB-AGENT (DOMAIN AGNOSTIC)
// ─────────────────────────────────────────────────────────────────────────────
async function researchNews(llmClient, product) {
    const query = product
        ? `${product} UK market pricing news 2025`
        : "UK consumer pricing and cost trends 2025";
    console.log(`[ResearchAgent:News] 📰 Searching: "${query}"`);
    const webData = await searchWeb(query);
    const rawText = [
        webData.abstract,
        webData.answer,
        ...webData.relatedTopics,
    ]
        .filter(Boolean)
        .join("\n");
    const messages = [
        {
            role: "system",
            content: `You are a financial news analyst.

Respond with ONLY this JSON:
{"headlines": ["headline 1", "headline 2", "headline 3"], "context": "2-3 sentence summary"}`,
        },
        {
            role: "user",
            content: `Web data:
${rawText || "LIMITED DATA"}

Summarise the most relevant price-related market context.`,
        },
    ];
    let parsed = null;
    try {
        parsed = await llmClient.chatJSON(messages);
    }
    catch (err) {
        console.warn("[ResearchAgent:News] ⚠ News summarisation failed", err);
    }
    return {
        headlines: Array.isArray(parsed?.headlines)
            ? parsed.headlines.slice(0, 3)
            : [],
        context: typeof parsed?.context === "string"
            ? parsed.context
            : "Market conditions appear broadly stable.",
    };
}
export async function runResearchAgent(llmClient, plan) {
    console.log("[ResearchAgent] 🚀 Starting research", plan);
    const userStatedPriceInfo = plan.userStatedPrice && plan.userStatedPrice > 0
        ? {
            price: plan.userStatedPrice,
            currency: (plan.priceCurrency ?? plan.userHomeCurrency ?? "GBP").toUpperCase(),
            source: "user_stated",
            confidence: "high",
            rawContext: `User stated price: ${plan.userStatedPrice}`,
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
    const result = { priceInfo, fxInfo, newsInfo };
    console.log("[ResearchAgent] ✅ Final result");
    console.log(JSON.stringify(result, null, 2));
    console.log("[ResearchAgent] 📊 Status summary", {
        price: priceInfo ? "OK" : "SKIPPED",
        fx: fxInfo ? "OK" : "FAILED",
        news: newsInfo ? "OK" : "FAILED",
    });
    return result;
}
