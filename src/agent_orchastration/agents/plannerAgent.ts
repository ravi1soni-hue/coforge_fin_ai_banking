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
   - travelersCount (number of people)
2. Set a fact to null if it is NOT in the question.
3. Determine missingFacts: facts that are CRITICAL to answer an affordability or planning question
   but are genuinely absent from BOTH the question AND the known facts.
   - For any affordability/planning question: need goalType AND targetAmount
   - For trip questions: also need destination
   - NEVER mark a fact as missing if the user already provided it in this question.
4. If the question is about subscriptions, investments, or statements — missingFacts = [].

Return ONLY valid JSON, no markdown:
{
  "extractedFacts": {
    "goalType": string | null,
    "destination": string | null,
    "targetAmount": number | null,
    "currency": string | null,
    "duration": string | null,
    "timeframe": string | null,
    "travelersCount": number | null
  },
  "missingFacts": string[]
}`);

  // Merge extracted facts — LLM-extracted values take precedence only when non-null
  const llmFacts = extraction.extractedFacts ?? {};
  const cleanLlmFacts = Object.fromEntries(
    Object.entries(llmFacts).filter(([, v]) => v !== null && v !== undefined)
  );
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