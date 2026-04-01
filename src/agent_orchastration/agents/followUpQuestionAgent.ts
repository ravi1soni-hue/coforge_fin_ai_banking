import { GraphStateType } from "../graph/state.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const followUpQuestionAgent = async (
  state: GraphStateType,
  _config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  if (!state.missingFacts || state.missingFacts.length === 0) {
    return {};
  }

  const factLabelMap: Record<string, string> = {
    targetAmount: "your approximate budget amount",
    currency: "the currency for that budget",
    budget: "your approximate trip budget",
    monthlyNetIncome: "your monthly take-home income",
    monthlyCommittedExpenses: "your fixed monthly expenses",
    availableSavings: "how much savings you can use for this trip",
    clarify_intent: "what decision you want help with",
  };

  const requested = state.missingFacts
    .slice(0, 3)
    .map((fact) => factLabelMap[fact] ?? fact.replace(/_/g, " "));

  const joined =
    requested.length === 1
      ? requested[0]
      : requested.length === 2
      ? `${requested[0]} and ${requested[1]}`
      : `${requested[0]}, ${requested[1]}, and ${requested[2]}`;

  const followUpQuestion =
    requested.length === 1
      ? `To check affordability properly, could you share ${joined}?`
      : `To give you a reliable banking affordability answer, could you share ${joined}?`;

  return {
    finalAnswer: followUpQuestion,
  };
};
