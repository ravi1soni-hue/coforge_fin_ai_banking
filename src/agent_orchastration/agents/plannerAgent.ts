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
    return {
      missingFacts: [],
    };
  }

  const lowerQuestion = state.question.toLowerCase();
  const action = state.intent.action.toLowerCase();
  const knownFacts = state.knownFacts ?? {};
  const hasAffordabilityContext =
    knownFacts.queryType === "affordability" ||
    "targetAmount" in knownFacts ||
    "budget" in knownFacts ||
    "goalType" in knownFacts ||
    "destination" in knownFacts;

  const isAffordability =
    /afford|affordability|buy|purchase|plan|decision/.test(action) ||
    /\bcan i afford\b|\bnext month\b/.test(lowerQuestion) ||
    hasAffordabilityContext;
  const isSubscriptions = /subscription/.test(lowerQuestion);
  const isInvestmentPerformance =
    /investment/.test(lowerQuestion) && /profit|return|gain|loss/.test(lowerQuestion);
  const isStatement = /bank statement|statement/.test(lowerQuestion);

  // For affordability queries, identify critical missing facts
  if (isAffordability) {
    const missingFacts: string[] = [];

    // Check if goalType is provided (car, house, phone, trip, education, wedding, etc.)
    if (!knownFacts.goalType) {
      missingFacts.push("goalType");
    }

    // Check if target amount/budget is provided
    const hasTargetAmount =
      typeof knownFacts.targetAmount === "number" && knownFacts.targetAmount > 0;
    const hasBudget =
      typeof knownFacts.budget === "number" && knownFacts.budget > 0;

    if (!hasTargetAmount && !hasBudget) {
      missingFacts.push("targetAmount");
    }

    // For trips, check if destination is provided
    const goalType = typeof knownFacts.goalType === "string"
      ? knownFacts.goalType.toLowerCase()
      : "";
    const isTrip = goalType === "trip" || goalType === "travel" || goalType === "vacation" || goalType === "holiday";

    if (isTrip && !knownFacts.destination) {
      missingFacts.push("destination");
    }

    // Return early if critical facts are missing (user will be asked to provide them)
    if (missingFacts.length > 0) {
      return {
        missingFacts,
      };
    }
  }

  // For non-affordability queries, proceed without asking for facts
  if (isSubscriptions || isInvestmentPerformance || isStatement) {
    return {
      missingFacts: [],
    };
  }

  // Default: no missing facts required
  return {
    missingFacts: [],
  };
};