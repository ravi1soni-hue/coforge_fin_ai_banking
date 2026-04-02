import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const plannerAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // If intent is too low confidence, skip fact checking
  if (!state.intent || state.intent.confidence < 0.5) {
    return { missingFacts: [] };
  }

  // Use the LLM to extract every fact stated in the message and decide
  // what is genuinely still missing — no brittle regex, no hardcoded lists.
  const extraction = await llm.generateJSON<{
    extractedFacts: Record<string, unknown>;
    missingFacts: string[];
  }>(`You are a financial planning assistant that extracts facts from a user question.

User question:
"${state.question}"

Already known facts (do not ask for these again):
${JSON.stringify(state.knownFacts ?? {})}

Instructions:
1. Extract EVERY fact explicitly stated in the question:
   - goalType (trip, car, house, phone, electronics, education, wedding, medical, investment, general)
   - destination (city or country if mentioned)
   - targetAmount (numeric budget or cost)
   - currency (GBP, EUR, USD, JPY, etc. — infer from symbols or words like "euros", "pounds", "dollars")
   - duration (e.g. "3 days")
   - timeframe (e.g. "next month", "this year")
   - travelersCount (number of people; words like "alone", "solo", "by myself" = 1)
   - queryType: classify the overall intent as one of:
       "affordability"         — user wants to know if they can afford something
       "subscriptions"         — query is about subscriptions or recurring spending
       "investment_performance"— user asks about investment profit/loss/returns
       "bank_statement"        — user wants a statement or transaction summary
       "general_finance"       — everything else
2. Set a non-queryType fact to null if it is NOT in the question.
3. Determine missingFacts STRICTLY as follows:
   - A fact is missing ONLY when it is absent from BOTH the current question AND the already known facts above.
   - NEVER list a fact as missing if it already appears in the known facts, even if the user did not repeat it.
   - If the user's message is a short follow-up answer (e.g. a single word, a number, "alone", "yes", "no"),
     treat it as a reply to a previous question. In this case use the known facts as the primary context
     and extract only what the short answer adds.
   - For affordability/planning: need goalType AND targetAmount (only if absent from known facts)
   - For trip questions: also need destination (only if absent from known facts)
   - If queryType is subscriptions, investment_performance, or bank_statement — missingFacts = [].

Return ONLY valid JSON, no markdown:
{
  "extractedFacts": {
    "goalType": string | null,
    "destination": string | null,
    "targetAmount": number | null,
    "currency": string | null,
    "duration": string | null,
    "timeframe": string | null,
    "travelersCount": number | null,
    "queryType": string
  },
  "missingFacts": string[]
}`);

  // Merge extracted facts — LLM-extracted values take precedence only when non-null
  const llmFacts = extraction.extractedFacts ?? {};
  const cleanLlmFacts = Object.fromEntries(
    Object.entries(llmFacts).filter(([, v]) => v !== null && v !== undefined)
  );

  // ── Guard: if intentAgent resolved a non-affordability action (e.g. user
  //    confirmed "Yes do it" for a savings plan), do NOT let the LLM override
  //    queryType back to "affordability" just because the Paris trip facts are
  //    still in the session.
  const nonAffordabilityActions = ["planning", "forecast", "review", "optimization", "statement"];
  if (
    nonAffordabilityActions.includes(state.intent?.action ?? "") &&
    cleanLlmFacts.queryType === "affordability"
  ) {
    cleanLlmFacts.queryType = "general_finance";
  }

  const mergedKnownFacts = { ...state.knownFacts, ...cleanLlmFacts };

  const missingFacts = Array.isArray(extraction.missingFacts)
    ? extraction.missingFacts
    : [];

  if (missingFacts.length > 0) {
    return {
      missingFacts,
      knownFacts: mergedKnownFacts,
    };
  }

  return {
    missingFacts: [],
    knownFacts: mergedKnownFacts,
  };
};