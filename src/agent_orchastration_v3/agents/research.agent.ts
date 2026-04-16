/**
 * Research Agent — data gathering with treasury anchor enforcement.
 *
 * Responsibilities:
 * - RETAIL FLOW:
 *   - Price research (web)
 *   - FX conversion
 *   - News context
 *
 * - TREASURY FLOW:
 *   - NO web search
 *   - NO FX
 *   - NO news
 *   - Use treasuryAnchorAmount as the ONLY amount
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type {
  AgentPlan,
  PriceInfo,
  FxInfo,
  NewsInfo,
  FinancialState,
} from "../graph/state.js";

import { searchWeb } from "../tools/webSearch.js";
import { getExchangeRate } from "../tools/exchangeRate.js";

// ─────────────────────────────────────────────────────────────────────────────
// Retail sub‑agents (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function researchPrice(
  llmClient: V3LlmClient,
  searchQuery: string,
  priceCurrency: string | undefined,
): Promise<PriceInfo> {
  const resolvedCurrency = priceCurrency ?? "GBP";

  const webData = await searchWeb(searchQuery);
  const webContext = [
    webData.abstract,
    webData.answer,
    ...(webData.relatedTopics ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  const messages: AgenticMessage[] = [
    {
      role: "system",
      content: `You are a product price researcher.

Respond ONLY with JSON:
{"price": <number>, "currency": "<ISO>", "source": "web_search", "confidence": "<high|medium|low>"}

Rules:
- Never guess
- If unclear, return price: 0`,
    },
    {
      role: "user",
      content: `Search query: "${searchQuery}"

Web results:
${webContext || "No reliable data"}`,
    },
  ];

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = await llmClient.chatJSON<Record<string, unknown>>(messages);
  } catch {}

  if (parsed?.price && Number(parsed.price) > 0) {
    return {
      price: Number(parsed.price),
      currency: String(parsed.currency ?? resolvedCurrency).toUpperCase(),
      source: "web_search",
      confidence:
        parsed.confidence === "high" ||
        parsed.confidence === "medium"
          ? parsed.confidence
          : "low",
      rawContext: webContext.slice(0, 500),
    };
  }

  return {
    price: 0,
    currency: resolvedCurrency,
    source: "web_search",
    confidence: "low",
    rawContext: webContext.slice(0, 300),
  };
}

async function researchFx(from: string, to: string): Promise<FxInfo | null> {
  try {
    const rate = await getExchangeRate(from, to);
    return { rate, from, to };
  } catch {
    return null;
  }
}

async function researchNews(
  llmClient: V3LlmClient,
  topic?: string,
): Promise<NewsInfo> {
  const query = topic
    ? `${topic} UK market news`
    : "UK consumer finance news";

  const webData = await searchWeb(query);
  const rawText = [
    webData.abstract,
    webData.answer,
    ...(webData.relatedTopics ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  const messages: AgenticMessage[] = [
    {
      role: "system",
      content: `Summarise market news. Respond ONLY with JSON:
{"headlines": [...], "context": "summary"}`,
    },
    {
      role: "user",
      content: rawText || "No data available",
    },
  ];

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = await llmClient.chatJSON<Record<string, unknown>>(messages);
  } catch {}

  return {
    headlines: Array.isArray(parsed?.headlines)
      ? (parsed!.headlines as string[]).slice(0, 3)
      : [],
    context:
      typeof parsed?.context === "string"
        ? parsed.context
        : "Market conditions appear stable.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main research agent (ANCHOR‑SAFE)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchResult {
  priceInfo: PriceInfo | null;
  fxInfo: FxInfo | null;
  newsInfo: NewsInfo | null;
}

export async function runResearchAgent(
  llmClient: V3LlmClient,
  plan: AgentPlan,
  state: FinancialState,
): Promise<ResearchResult> {

  // ── ✅ TREASURY FLOW: ANCHOR ONLY ─────────────────────────────────
  if (
    plan.intentType === "corporate_treasury" &&
    state.treasuryAnchorAmount !== null
  ) {
    console.log(
      `[ResearchAgent] Treasury flow — using anchor £${state.treasuryAnchorAmount.toLocaleString(
        "en-GB"
      )}`
    );

    return {
      priceInfo: {
        price: state.treasuryAnchorAmount,
        currency: state.treasuryAnchorCurrency ?? "GBP",
        source: "user_stated",
        confidence: "high",
        rawContext: "Treasury anchor amount (user‑explicit)",
      },
      fxInfo: null,
      newsInfo: null,
    };
  }

  // ── 🛒 RETAIL FLOW (original behaviour) ───────────────────────────

  const statedPrice = plan.userStatedPrice ?? 0;

  const userStatedPriceInfo: PriceInfo | null =
    statedPrice > 0
      ? {
          price: statedPrice,
          currency:
            (plan.priceCurrency ?? plan.userHomeCurrency ?? "GBP").toUpperCase(),
          source: "user_stated",
          confidence: "high",
          rawContext: `User stated price: ${statedPrice}`,
        }
      : null;

  const [priceInfo, fxInfo, newsInfo] = await Promise.all([
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
  ]);

  return { priceInfo, fxInfo, newsInfo };
}