// finance-decision-agent.ts
// Agent to classify user queries as retail or corporate/treasury and route to the correct analysis logic.
// Usage: Pass user question and context, get back routing decision and next action.


export type FinanceDecisionType = 'corporate_treasury' | 'retail_personal' | 'unknown';

export interface FinanceDecisionResult {
  type: FinanceDecisionType;
  reason: string;
  next: () => Promise<any>;
}

// Simple keyword/entity-based intent classifier. Can be replaced with LLM for more flexibility.

// --- Stub implementations for downstream analysis functions ---
// Replace with actual logic or import real implementations as needed.
// --- Real implementations: delegate to orchestration services ---
// context must provide treasuryAnalysisService and v3LlmClient, plus state
export async function analyzeTreasuryDecision(question: string, context: any): Promise<any> {
  // context: { userId, userMessage, knownFacts, treasuryAnalysisService }
  if (!context?.treasuryAnalysisService || !context?.userId) {
    throw new Error('treasuryAnalysisService and userId required in context');
  }
  return context.treasuryAnalysisService.analyze(
    context.userId,
    question,
    context.knownFacts ?? {}
  );
}

export async function analyzeRetailDecision(question: string, context: any): Promise<any> {
  // context: { v3LlmClient, state }
  if (!context?.v3LlmClient || !context?.state) {
    throw new Error('v3LlmClient and state required in context');
  }
  // runAffordabilityAgent returns AffordabilityInfo
  const { runAffordabilityAgent } = await import("./agents/affordability.agent.js");
  return runAffordabilityAgent(context.v3LlmClient, context.state);
}
export function classifyFinanceIntent(question: string): FinanceDecisionType {
  const q = question.toLowerCase();
  if (q.includes('supplier payment') || q.includes('treasury') || q.includes('payment run') || q.includes('release') || q.includes('corporate')) {
    return 'corporate_treasury';
  }
  if (q.includes('salary') || q.includes('personal') || q.includes('spending') || q.includes('savings') || q.includes('retail')) {
    return 'retail_personal';
  }
  return 'unknown';
}

export async function financeDecisionAgent(question: string, context: any): Promise<FinanceDecisionResult> {
  const type = classifyFinanceIntent(question);
  if (type === 'corporate_treasury') {
    return {
      type,
      reason: 'Detected corporate/treasury intent (e.g., supplier payment, payment run, release)',
      next: async () => analyzeTreasuryDecision(question, context)
    };
  }
  if (type === 'retail_personal') {
    return {
      type,
      reason: 'Detected retail/personal finance intent (e.g., salary, spending, savings)',
      next: async () => analyzeRetailDecision(question, context)
    };
  }
  return {
    type,
    reason: 'Could not confidently classify intent. Needs fallback or clarification.',
    next: async () => ({ error: 'Intent unclear. Please clarify your question.' })
  };
}
