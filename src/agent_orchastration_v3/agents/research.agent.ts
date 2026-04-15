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

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { AgentPlan, PriceInfo, FxInfo, NewsInfo } from "../graph/state.js";
import { searchWeb } from "../tools/webSearch.js";
import { getExchangeRate } from "../tools/exchangeRate.js";

// ─── Price sub-agent ─────────────────────────────────────────────────────────

async function researchPrice(
  llmClient: V3LlmClient,
  searchQuery: string,
  priceCurrency: string | undefined,
  ragContext?: string[]
): Promise<PriceInfo> {
  console.log(`[ResearchAgent:Price] Searching for: "${searchQuery}"`);

  const resolvedCurrency = priceCurrency ?? "GBP";
  const noDataFallback = `No web data available — return {"price": 0, "currency": "${resolvedCurrency}", "source": "web_search", "confidence": "low"}.`;

  // 1. Get web data from Serper.dev (Google Search, UK results)
  // LLM is responsible for all context/intent extraction. No regex/static logic.
  const webData = await searchWeb(searchQuery);
  const webContext = [
    webData.abstract,
    webData.answer,
    ...webData.relatedTopics,
  ]
    .filter(Boolean)
    .join("\n");

  console.log(`[ResearchAgent:Price] Web context length: ${webContext.length} chars`);

  // 2. Ask LLM to extract/estimate the price using web data + RAG context
  const messages: AgenticMessage[] = [
    {
      role: "system",
      content: `You are a product price researcher. Extract the current retail price strictly from the web data and RAG context provided below.`,
    },
    {
      role: "user",
      content: `Product search: "${searchQuery}"
Expected currency: ${resolvedCurrency}

Web search results:
${webContext || noDataFallback}

RAG context:
${(ragContext && ragContext.length > 0) ? ragContext.join("\n") : "No RAG context available."}

Extract the current retail price strictly from the web data and RAG context above. Do NOT use training knowledge to estimate a price.`,
    },
  ];

  let parsed: Record<string, unknown> | null = null;
  try { parsed = await llmClient.chatJSON<Record<string, unknown>>(messages); } catch { /* fall through */ }

  if (!parsed || typeof parsed.price !== 'number' || typeof parsed.currency !== 'string' || typeof parsed.source !== 'string' || typeof parsed.confidence !== 'string') {
    console.log(`[ResearchAgent:Price] Failed to parse LLM response: ${JSON.stringify(parsed)}`);
    return { price: 0, currency: resolvedCurrency, source: "web_search", confidence: "low", rawContext: webContext };
  }
  return {
    price: parsed.price as number,
    currency: parsed.currency as string,
    source: parsed.source as "web_search" | "llm_knowledge" | "user_stated",
    confidence: parsed.confidence as "high" | "medium" | "low",
    rawContext: webContext,
  };
}

// ─── FX sub-agent ───────────────────────────────────────────────────────────

async function researchFx(
  from: string,
  to: string,
): Promise<FxInfo | null> {
  console.log(`[ResearchAgent:FX] Fetching rate: ${from} → ${to}`);
  try {
    const rate = await getExchangeRate(from, to);
    console.log(`[ResearchAgent:FX] Rate ${from}→${to}: ${rate}`);
    return { rate, from: from.toUpperCase(), to: to.toUpperCase() };
  } catch (err) {
    console.error("[ResearchAgent:FX] Failed:", err);
    return null;
  }
}

// ─── News sub-agent ──────────────────────────────────────────────────────────

async function researchNews(
  llmClient: V3LlmClient,
  product: string | undefined,
): Promise<NewsInfo> {
  const query = product
    ? `${product} UK price market news 2025`
    : "UK consumer finance news 2025";

  console.log(`[ResearchAgent:News] Searching for news: "${query}"`);

  const webData = await searchWeb(query);
  const rawText = [webData.abstract, webData.answer, ...webData.relatedTopics]
    .filter(Boolean)
    .join("\n");

  const messages: AgenticMessage[] = [
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

  let parsed: Record<string, unknown> | null = null;
  try { parsed = await llmClient.chatJSON<Record<string, unknown>>(messages); } catch { /* fall through */ }

  if (!parsed || !Array.isArray(parsed.headlines) || typeof parsed.context !== 'string') {
    console.log(`[ResearchAgent:News] Failed to parse LLM response: ${JSON.stringify(parsed)}`);
    return { headlines: [], context: "No news data available" };
  }
  return {
    headlines: parsed.headlines as string[],
    context: parsed.context as string,
  };
}

// ─── Research agent ──────────────────────────────────────────────────────────

/**
 * Runs the full research agent.
 *
 * If the user stated a price explicitly, use it directly — no web search needed.
 * Otherwise, search for the product and extract the price using web data + RAG context.
 *
 * @param llmClient - LLM client
 * @param plan - Agent plan
 * @param ragContext - RAG context (optional)
 * @returns Research result
 */
export interface ResearchResult {
  priceInfo: PriceInfo | null;
  fxInfo: FxInfo | null;
  newsInfo: NewsInfo | null;
}

export async function runResearchAgent(
  llmClient: V3LlmClient,
  plan: AgentPlan,
  ragContext?: string[]
): Promise<ResearchResult> {
  // If the user stated a price explicitly, use it directly — no web search needed.
  const statedPrice = plan.userStatedPrice ?? 0;
  const userStatedPriceInfo: PriceInfo | null = statedPrice > 0
    ? {
        price:      statedPrice,
        currency:   (plan.priceCurrency ?? plan.userHomeCurrency ?? "GBP").toUpperCase(),
        source:     "user_stated",
        confidence: "high",
        rawContext: `User stated price: ${statedPrice}`,
      }
    : null;

  const tasks: Promise<any>[] = [];
  tasks.push(
    userStatedPriceInfo
      ? Promise.resolve(userStatedPriceInfo)
      : plan.needsWebSearch && plan.searchQuery
        ? researchPrice(llmClient, plan.searchQuery, plan.priceCurrency, ragContext)
        : Promise.resolve(null),
  );

  tasks.push(
    plan.needsFxConversion && plan.priceCurrency && plan.targetCurrency
      ? researchFx(plan.priceCurrency, plan.targetCurrency)
      : Promise.resolve(null),
  );

  tasks.push(
    plan.needsNews
      ? researchNews(llmClient, plan.product)
      : Promise.resolve(null),
  );

  const [priceInfo, fxInfo, newsInfo] = await Promise.all(tasks);
  return { priceInfo, fxInfo, newsInfo };
}
