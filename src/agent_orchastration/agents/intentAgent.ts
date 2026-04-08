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
    subject?: string | null;
    confidence: number;
  }>(`
  You are an intent classification agent for a financial AI assistant.
  
  STRICT OUTPUT RULES (MANDATORY):
  - Output MUST be a single valid JSON object
  - Output MUST start with "{" and end with "}"
  - No text, no markdown, no explanation
  - No apologies or natural language
  - If uncertain, STILL return JSON using domain="general" and action="conversation"
  
  Task:
  Classify the user's request into a GENERIC FINANCIAL INTENT.
  
  Guidelines:
  - Domain: broad financial area (travel, saving, investing, loans, spending, income, general)
  - Action: what the user wants (affordability, planning, optimization, decision, explanation, conversation)
  - Subject: optional, short string or null
  - Confidence: number between 0 and 1
  
  User message:
  "${state.question}"
  
  Return exactly this JSON shape:
  {
    "domain": "string",
    "action": "string",
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