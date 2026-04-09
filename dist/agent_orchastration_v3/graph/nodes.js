/**
 * LangGraph node functions for the Financial Assistant graph.
 *
 * Each node takes the current GraphState and returns a Partial<GraphState>
 * with only the keys it updates.  LangGraph merges the partial update into
 * the shared state before proceeding to the next node.
 *
 * Graph shape (see workflow.ts):
 *
 *   START
 *     → loadContext          (profile + history in parallel via Promise.all)
 *     → extractIntent        (heuristic intent parse — no LLM needed)
 *     → (conditional)
 *         → [fetchPrice ∥ fetchFx]   (parallel fan-out)
 *             → checkAffordability
 *             → generateResponse → END
 *         → generateEmi → END        (when user confirms instalments)
 *
 * Key design principle: all financial computation (price lookup, FX, affordability,
 * EMI maths) is done deterministically here.  The LLM is invoked ONLY to format
 * the final natural-language narrative from the structured data.
 */
import { fetchLivePrice, fetchMarketData, checkAffordability, generateEmiPlan, } from "../tools/implementations.js";
import { buildSystemPrompt } from "../systemPrompt.js";
// ─── Regex helpers for intent extraction ─────────────────────────────────────
/** Matches explicit amount + currency: "4000 GBP", "GBP 4000", "£4000", "€1,329", "$1500" */
const PRICE_RE = /(?:£|€|\$)\s*([\d,]+(?:\.\d{1,2})?)|(?:([\d,]+(?:\.\d{1,2})?)\s*(GBP|EUR|USD|INR))|(?:(GBP|EUR|USD|INR)\s*([\d,]+(?:\.\d{1,2})?))/i;
/** Maps symbol → ISO code */
const SYMBOL_TO_CODE = { "£": "GBP", "€": "EUR", "$": "USD" };
/** Matches common EMI / instalment confirmation phrases */
const EMI_CONFIRM_RE = /\b(yes|sure|please|go ahead|show me|yes please|show plan|instalment|installment|emi plan|run emi|run plan)\b/i;
/** Extracts a product name from common consumer electronics patterns */
const PRODUCT_RE = /(iphone\s+[\w\s]+?(?=\s+in|\s+from|\s+for|\s+at|\s+is|\s+that|\s+which|$)|samsung\s+galaxy\s+[\w\s]+?(?=\s+in|\s+from|$)|macbook\s+[\w\s]+?(?=\s+in|\s+from|$)|ipad\s+[\w\s]+?(?=\s+in|\s+from|$)|pixel\s+[\d\w\s]+?(?=\s+in|\s+from|$)|tesla\s+\w+)/i;
function detectCurrency(match, message, fallback) {
    if (!match)
        return fallback;
    if (match[1]) {
        // Symbol form — extract the preceding symbol character
        const sym = message[match.index];
        return SYMBOL_TO_CODE[sym] ?? fallback;
    }
    if (match[3])
        return match[3].toUpperCase();
    if (match[4])
        return match[4].toUpperCase();
    return fallback;
}
// ─── Node: loadContext ────────────────────────────────────────────────────────
export function makeLoadContextNode(loader, chatRepo) {
    return async function loadContextNode(state) {
        const [profile, history] = await Promise.all([
            loader.loadProfile(state.userId, {}),
            chatRepo.getHistory(state.userId, state.sessionId, 12),
        ]);
        console.log(`[Graph:loadContext] profile loaded for ${state.userId}, currency=${profile.homeCurrency}`);
        return { profile, history };
    };
}
// ─── Node: extractIntent ──────────────────────────────────────────────────────
export function makeExtractIntentNode() {
    return function extractIntentNode(state) {
        const msg = state.userMessage;
        const homeCurrency = state.profile?.homeCurrency ?? "GBP";
        // ── EMI confirmation? ───────────────────────────────────────────────────
        const isEmiConfirmation = EMI_CONFIRM_RE.test(msg);
        let prevCost = null;
        let prevCostCurrency = null;
        if (isEmiConfirmation && state.history.length > 0) {
            // Try to recover the RISKY/CANNOT_AFFORD cost from the last assistant turn
            const lastAssistant = [...state.history]
                .reverse()
                .find((h) => h.role === "assistant");
            if (lastAssistant) {
                // Look for a cost pattern in the previous assistant message
                const prevMatch = PRICE_RE.exec(lastAssistant.content);
                if (prevMatch) {
                    const raw = (prevMatch[1] ?? prevMatch[2] ?? prevMatch[5]).replace(/,/g, "");
                    prevCost = parseFloat(raw);
                    prevCostCurrency = detectCurrency(prevMatch, lastAssistant.content, homeCurrency);
                }
            }
        }
        // ── Product + price ─────────────────────────────────────────────────────
        const priceMatch = PRICE_RE.exec(msg);
        const costProvided = priceMatch
            ? parseFloat((priceMatch[1] ?? priceMatch[2] ?? priceMatch[5]).replace(/,/g, ""))
            : null;
        // If user did not provide a numeric price/currency, keep this null so FX node can decide later.
        const costCurrency = priceMatch
            ? detectCurrency(priceMatch, msg, homeCurrency)
            : null;
        const productMatch = PRODUCT_RE.exec(msg);
        const product = productMatch ? productMatch[0].trim() : null;
        console.log(`[Graph:extractIntent] product="${product}" cost=${costProvided} currency=${costCurrency} emi=${isEmiConfirmation}`);
        return { product, costProvided, costCurrency, isEmiConfirmation, prevCost, prevCostCurrency };
    };
}
// ─── Node: fetchPrice ─────────────────────────────────────────────────────────
export function makeFetchPriceNode() {
    return async function fetchPriceNode(state) {
        // Skip if user already provided a cost or this is an EMI confirmation
        if (state.costProvided !== null || state.isEmiConfirmation) {
            console.log("[Graph:fetchPrice] skipped — cost already known or EMI confirmation");
            return { priceData: null };
        }
        const query = state.product
            ? (state.costCurrency ? `${state.product} price ${state.costCurrency}` : `${state.product} price`)
            : `${state.userMessage} price`;
        console.log(`[Graph:fetchPrice] searching: "${query}"`);
        const result = await fetchLivePrice({ query });
        console.log(`[Graph:fetchPrice] confidence=${result.confidence} range=${JSON.stringify(result.priceRange)}`);
        if (!result.priceRange) {
            return { priceData: null };
        }
        // Use midpoint of the price range as the working price
        const price = Math.round((result.priceRange.min + result.priceRange.max) / 2);
        return {
            priceData: {
                price,
                currency: result.priceRange.currency,
                source: result.confidence === "confirmed" ? "live" : "retail estimate",
                confidence: result.confidence,
            },
        };
    };
}
// ─── Node: fetchFx ────────────────────────────────────────────────────────────
export function makeFetchFxNode() {
    return async function fetchFxNode(state) {
        const homeCurrency = state.profile?.homeCurrency ?? "GBP";
        // Determine what currency the final price will be in
        const priceCurrency = state.costProvided !== null
            ? state.costCurrency ?? homeCurrency
            : null; // Will be known after fetchPrice; but fetchFx runs in parallel
        // If we're doing EMI or the price is already in home currency, skip FX
        if (state.isEmiConfirmation) {
            console.log("[Graph:fetchFx] skipped — EMI confirmation");
            return { fxData: null };
        }
        // If user explicitly provided cost in home currency, no FX needed
        if (state.costProvided !== null && (state.costCurrency ?? homeCurrency) === homeCurrency) {
            console.log("[Graph:fetchFx] skipped — cost already in home currency");
            return { fxData: null };
        }
        // We need FX: either user gave a foreign-currency cost, or we'll fetch a price
        // and it might come back in EUR/USD. Fetch EUR→homeCurrency and USD→homeCurrency
        // proactively so the data is ready when checkAffordability runs.
        // Primary: use the currency the user mentioned, fall back to EUR (most common for EU purchases).
        const fromCurrency = state.costProvided !== null
            ? (state.costCurrency ?? "EUR")
            : (state.costCurrency !== homeCurrency ? state.costCurrency ?? "EUR" : null);
        if (!fromCurrency || fromCurrency === homeCurrency) {
            console.log("[Graph:fetchFx] skipped — same currency as home");
            return { fxData: null };
        }
        console.log(`[Graph:fetchFx] fetching ${fromCurrency} → ${homeCurrency}`);
        const result = await fetchMarketData({ fromCurrency, toCurrency: homeCurrency });
        console.log(`[Graph:fetchFx] rate=${result.rate}`);
        if (!result.rate) {
            return { fxData: null };
        }
        return {
            fxData: { rate: result.rate, from: fromCurrency, to: homeCurrency },
        };
    };
}
// ─── Node: checkAffordability ─────────────────────────────────────────────────
export function makeCheckAffordabilityNode() {
    return function checkAffordabilityNode(state) {
        if (state.isEmiConfirmation || !state.profile) {
            return { affordabilityData: null };
        }
        // Resolve the working cost: user-provided → fetched → unknown
        let cost;
        let currency;
        const homeCurrency = state.profile.homeCurrency;
        if (state.costProvided !== null) {
            cost = state.costProvided;
            currency = state.costCurrency ?? homeCurrency;
        }
        else if (state.priceData) {
            cost = state.priceData.price;
            currency = state.priceData.currency;
        }
        else {
            console.warn("[Graph:checkAffordability] no cost data — skipping");
            return { affordabilityData: { verdict: "UNKNOWN", explanation: "No price data available." } };
        }
        const fxRate = state.fxData?.rate;
        console.log(`[Graph:checkAffordability] cost=${cost} ${currency} fxRate=${fxRate ?? "n/a"} home=${homeCurrency}`);
        const result = checkAffordability({ userId: state.userId, cost, currency, fxRate }, state.profile);
        return { affordabilityData: result };
    };
}
function toNum(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function toStr(v) {
    return typeof v === "string" && v.trim().length > 0 ? v : null;
}
function fmtAmount(currency, value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return `${currency} unknown`;
    }
    return `${currency} ${Math.round(value).toLocaleString("en-GB")}`;
}
function buildDeterministicAffordabilityResponse(state, af) {
    const homeCurrency = state.profile?.homeCurrency ?? "GBP";
    const displayCost = state.costProvided ?? state.priceData?.price ?? null;
    const displayCurrency = state.costProvided !== null
        ? (state.costCurrency ?? homeCurrency)
        : (state.priceData?.currency ?? homeCurrency);
    const displaySource = state.costProvided !== null ? "user provided" : (state.priceData?.source ?? "unknown");
    const verdict = (toStr(af?.verdict) ?? "UNKNOWN").toUpperCase();
    const costInHome = toNum(af?.costInHomeCurrency);
    const remaining = toNum(af?.remainingAfterPayment);
    const buffer = toNum(af?.emergencyBuffer);
    const lines = [];
    lines.push(`**Verdict: ${verdict}**`);
    lines.push(`• Price: ${fmtAmount(displayCurrency, displayCost)} (source: ${displaySource})`);
    if (state.fxData?.rate &&
        state.fxData.from &&
        state.fxData.to &&
        state.fxData.from !== state.fxData.to &&
        costInHome !== null) {
        lines.push(`• In ${state.fxData.to}: ${fmtAmount(state.fxData.to, costInHome)} (rate: 1 ${state.fxData.from} = ${state.fxData.rate} ${state.fxData.to})`);
    }
    if (remaining !== null && buffer !== null) {
        const position = remaining >= buffer ? "above" : "below";
        lines.push(`• Savings after lump-sum: ${fmtAmount(homeCurrency, remaining)} (${position} ${fmtAmount(homeCurrency, buffer)} emergency buffer)`);
    }
    else if (toStr(af?.explanation)) {
        lines.push(`• ${toStr(af?.explanation)}`);
    }
    if (verdict === "RISKY" || verdict === "CANNOT_AFFORD") {
        lines.push("");
        lines.push("Would you like me to run an EMI plan or a savings projection?");
    }
    return lines.join("\n");
}
function buildDeterministicEmiResponse(emiResult) {
    const plans = Array.isArray(emiResult.plans)
        ? emiResult.plans
        : [];
    const lines = ["EMI Plan:"];
    plans.forEach((plan, index) => {
        const months = toNum(plan.months) ?? 0;
        const monthlyPayment = toNum(plan.monthlyPayment);
        const currency = toStr(emiResult.currency) ?? "GBP";
        lines.push(`• OPTION ${index + 1}: ${months}-Month Plan`);
        lines.push(`• Monthly payment: ${fmtAmount(currency, monthlyPayment)}`);
        lines.push("");
    });
    const why = toStr(emiResult.whyInstalments) ?? "Instalments spread payments and protect savings liquidity.";
    lines.push(`• Why instalments help: ${why}`);
    return lines.join("\n").trim();
}
// ─── Node: generateResponse ───────────────────────────────────────────────────
export function makeGenerateResponseNode(llmClient, chatRepo) {
    return async function generateResponseNode(state) {
        if (!state.profile) {
            return { response: "Sorry, I could not load your financial profile. Please try again." };
        }
        const af = state.affordabilityData;
        const homeCurrency = state.profile.homeCurrency;
        // Resolve display price details for the LLM context
        const displayCost = state.costProvided ?? state.priceData?.price ?? null;
        const displayCurrency = state.costProvided !== null
            ? (state.costCurrency ?? homeCurrency)
            : (state.priceData?.currency ?? homeCurrency);
        const displaySource = state.costProvided !== null ? "user provided" : (state.priceData?.source ?? "unknown");
        const fxRate = state.fxData?.rate ?? null;
        const fxFrom = state.fxData?.from ?? null;
        const fxTo = state.fxData?.to ?? null;
        // Build a rich context message so the LLM only needs to FORMAT the answer
        const dataContext = `
FINANCIAL DATA (use these exact numbers — do NOT invent any figures):

User profile:
  • Savings: ${homeCurrency} ${state.profile.availableSavings.toLocaleString("en-GB")}
  • Monthly surplus: ${state.profile.netMonthlySurplus != null ? `${homeCurrency} ${state.profile.netMonthlySurplus.toLocaleString("en-GB")}` : "unknown"}
  • Home currency: ${homeCurrency}

Price data:
  • Item: ${state.product ?? "the requested item"}
  • Price: ${displayCurrency} ${displayCost?.toLocaleString("en-GB") ?? "unknown"} (source: ${displaySource})
  ${fxRate && fxFrom && fxTo && fxFrom !== fxTo ? `• FX rate: 1 ${fxFrom} = ${fxRate} ${fxTo}` : "• No FX conversion needed (price already in home currency)"}

Affordability result:
${af ? JSON.stringify(af, null, 2) : "  • Not computed"}

Generate the affordability response now following the OUTPUT FORMAT rules in the system instructions.
`.trim();
        const messages = [
            { role: "system", content: buildSystemPrompt(state.profile) },
            ...state.history.map((h) => ({
                role: h.role,
                content: h.content,
            })),
            { role: "user", content: state.userMessage },
            { role: "user", content: dataContext },
        ];
        let response = "";
        try {
            console.log("[Graph:generateResponse] calling LLM for final narrative");
            const llmResponse = await llmClient.chat(messages, []); // no tools on final call
            response = (llmResponse.content ?? "").trim();
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[Graph:generateResponse] LLM formatting failed, using deterministic fallback: ${msg}`);
        }
        if (!response) {
            response = buildDeterministicAffordabilityResponse(state, af);
        }
        // Persist history
        void chatRepo.saveMessage(state.userId, state.sessionId, "user", state.userMessage);
        void chatRepo.saveMessage(state.userId, state.sessionId, "assistant", response);
        console.log("[Graph:generateResponse] done");
        return { response };
    };
}
// ─── Node: generateEmi ────────────────────────────────────────────────────────
export function makeGenerateEmiNode(llmClient, chatRepo) {
    return async function generateEmiNode(state) {
        if (!state.profile) {
            return { response: "Sorry, I could not load your financial profile. Please try again." };
        }
        // Recover cost from prev turn (extracted in extractIntent)
        const cost = state.prevCost ?? state.costProvided ?? null;
        const currency = state.prevCostCurrency ?? state.costCurrency ?? state.profile.homeCurrency;
        if (!cost) {
            return {
                response: "I don't have the purchase amount on record. Could you share the cost so I can run the instalment plan?",
            };
        }
        console.log(`[Graph:generateEmi] generating EMI plan: ${currency} ${cost}`);
        const emiResult = generateEmiPlan({ userId: state.userId, cost, currency }, state.profile);
        const homeCurrency = state.profile.homeCurrency;
        const dataContext = `
EMI PLAN DATA (use these exact numbers — do NOT invent any figures):

User profile:
  • Savings: ${homeCurrency} ${state.profile.availableSavings.toLocaleString("en-GB")}
  • Home currency: ${homeCurrency}

EMI plan result:
${JSON.stringify(emiResult, null, 2)}

Generate the EMI plan response now following the OUTPUT FORMAT → EMI plan rules in the system instructions.
Show all 3 options.
`.trim();
        const messages = [
            { role: "system", content: buildSystemPrompt(state.profile) },
            ...state.history.map((h) => ({
                role: h.role,
                content: h.content,
            })),
            { role: "user", content: state.userMessage },
            { role: "user", content: dataContext },
        ];
        let response = "";
        try {
            console.log("[Graph:generateEmi] calling LLM for EMI narrative");
            const llmResponse = await llmClient.chat(messages, []); // no tools on final call
            response = (llmResponse.content ?? "").trim();
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[Graph:generateEmi] LLM formatting failed, using deterministic fallback: ${msg}`);
        }
        if (!response) {
            response = buildDeterministicEmiResponse(emiResult);
        }
        void chatRepo.saveMessage(state.userId, state.sessionId, "user", state.userMessage);
        void chatRepo.saveMessage(state.userId, state.sessionId, "assistant", response);
        console.log("[Graph:generateEmi] done");
        return { response };
    };
}
// ─── Conditional router ───────────────────────────────────────────────────────
/**
 * After extractIntent: route to EMI generation or kick off the parallel
 * price + FX analysis branch.
 *
 * Returning an array from addConditionalEdges causes LangGraph to fan-out to
 * all listed nodes in parallel — this is the mechanism for running fetchPrice
 * and fetchFx concurrently.
 */
export function routeAfterIntent(state) {
    if (state.isEmiConfirmation) {
        console.log("[Graph:router] → generateEmi");
        return "generateEmi";
    }
    // Parallel fan-out: fetchPrice and fetchFx run concurrently
    console.log("[Graph:router] → [fetchPrice ∥ fetchFx]");
    return ["fetchPrice", "fetchFx"];
}
