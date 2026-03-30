import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const intentAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const result = await llm.generateJSON<{
    domain: string;
    action: string;
    subject?: string;
    confidence: number;
  }>(`
You are an intent classification agent for a financial AI assistant.

Your task is to classify the user's request into a GENERIC FINANCIAL INTENT.

Guidelines:
- Domain must be a broad financial area (e.g. travel, saving, investing, loans, spending, income, general).
- Action describes what the user wants to do (e.g. affordability, planning, optimization, decision, explanation).
- Subject is optional and should be short (e.g. "Japan trip", "car", "home loan").
- If the message is casual or unclear (e.g. "hello"), use:
  domain = "general"
  action = "conversation"
- Do NOT invent details.
- Keep output concise.
- Return ONLY valid JSON. No markdown, no explanation.

User message:
"${state.question}"

Return JSON:
{
  "domain": string,
  "action": string,
  "subject": string | null,
  "confidence": number
}
`);

  // ✅ Return only the patch
  return {
    intent: {
      domain: result.domain,
      action: result.action,
      subject: result.subject ?? undefined,
      confidence: result.confidence,
    },
  };
};