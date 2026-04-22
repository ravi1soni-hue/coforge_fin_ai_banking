/**
 * Affordability Agent — intelligent financial analysis.
 *
 * Takes the user profile + price + FX data and uses LLM reasoning to produce
 * a structured affordability verdict.  Nothing is hardcoded — the LLM evaluates
 * the full financial picture intelligently.
 *
 * Returns a structured AffordabilityInfo that the synthesis agent uses to
 * generate the final narrative.
 */
import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";
const SYSTEM_PROMPT = `You are an expert personal financial advisor in the UK banking sector.
Analyse whether the user can afford the described purchase based on their financial profile.

Respond with ONLY this JSON (no explanation, no markdown):
{
  "verdict": "<'SAFE'|'BORDERLINE'|'RISKY'>",
  "priceInHomeCurrency": <number rounded to nearest whole number>,
  "canAfford": <true|false>,
  "analysis": "<3-5 sentences of specific, intelligent financial analysis>",
  "emiSuggested": <true|false>
}

Verdict guidelines (apply intelligently, not mechanically):
- SAFE        → cost leaves comfortable savings buffer, can replenish from surplus within 2 months
- BORDERLINE  → affordable but tight, worth caution; consider saving more or using instalments
- RISKY       → would deplete savings significantly, or would take 6+ months of surplus to replenish

Set emiSuggested = true when BORDERLINE or RISKY, or when the user mentioned instalments.

Your analysis must be specific — cite actual numbers from the profile, not vague statements.`;
export async function runAffordabilityAgent(llmClient, state) {
    const profile = state.userProfile;
    const plan = state.plan;
    const price = state.priceInfo;
    const fx = state.fxInfo;
    const savings = Number(profile?.availableSavings ?? 0);
    const income = Number(profile?.monthlyIncome ?? 0);
    const expenses = Number(profile?.monthlyExpenses ?? 0);
    const surplus = Number(profile?.netMonthlySurplus ?? (income - expenses));
    const currency = String(profile?.homeCurrency ?? plan.userHomeCurrency ?? "GBP");
    // Calculate price in home currency
    let priceInHome = price?.price ?? 0;
    if (fx && price && price.currency !== currency) {
        priceInHome = price.price * fx.rate;
    }
    priceInHome = Math.round(priceInHome);
    // Sanitize the user message before LLM call
    const sanitizedUserMessage = sanitizeUserInput(state.userMessage);
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content: `User question: "${sanitizedUserMessage}"

User financial profile:
- Available savings:   ${savings.toLocaleString("en-GB")} ${currency}
- Monthly income:      ${income > 0 ? `${income.toLocaleString("en-GB")} ${currency}` : "not specified"}
- Monthly expenses:    ${expenses > 0 ? `${expenses.toLocaleString("en-GB")} ${currency}` : "not specified"}
- Net monthly surplus: ${surplus > 0 ? `${surplus.toLocaleString("en-GB")} ${currency}` : "not specified"}

Purchase details:
- Item: ${plan.product ?? "item"}
- Listed price: ${price?.price ?? "unknown"} ${price?.currency ?? "unknown"} (confidence: ${price?.confidence ?? "unknown"})
${fx ? `- Exchange rate: 1 ${fx.from} = ${fx.rate.toFixed(4)} ${fx.to}` : ""}
- Estimated price in ${currency}: ${priceInHome.toLocaleString("en-GB")} ${currency}

Provide a detailed affordability assessment.`,
        },
    ];
    console.log("[AffordabilityAgent] Calling LLM for analysis...");
    let parsed = null;
    try {
        parsed = await llmClient.chatJSON(messages);
    }
    catch { /* fall through */ }
    if (parsed?.verdict && ["SAFE", "BORDERLINE", "RISKY"].includes(parsed.verdict)) {
        console.log(`[AffordabilityAgent] Verdict: ${parsed.verdict}, canAfford: ${parsed.canAfford}`);
        return {
            verdict: parsed.verdict,
            priceInHomeCurrency: Number(parsed.priceInHomeCurrency ?? priceInHome),
            canAfford: Boolean(parsed.canAfford),
            analysis: String(parsed.analysis ?? "Unable to generate analysis."),
            emiSuggested: Boolean(parsed.emiSuggested),
        };
    }
    console.warn("[AffordabilityAgent] Could not parse verdict, defaulting to RISKY");
    return {
        verdict: "RISKY",
        priceInHomeCurrency: priceInHome,
        canAfford: false,
        analysis: "Unable to perform a complete affordability analysis with the available data.",
        emiSuggested: true,
    };
}
